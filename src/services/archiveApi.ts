import {
  ArchiveFileEntry,
  ArchiveFolderDetail,
  ArchiveSearchItem,
  FileCategory,
  NodeResolution,
  SearchFilters,
  ServerLocation,
} from '../types/archive';
import {
  detectNsfwContent,
  extractDirectArchiveId,
  naturalCompare,
  parseDomainInfo,
} from '../utils/formatters';

const SEARCH_CACHE = new Map<string, { ts: number; numFound: number; items: ArchiveSearchItem[] }>();
const FOLDER_DETAIL_CACHE = new Map<string, ArchiveFolderDetail>();
const NODE_CACHE = new Map<string, NodeResolution>();

const CACHE_TTL_MS = 5 * 60 * 1000;

const VIDEO_EXT_REGEX = /\.(mkv|mp4|avi|webm|mov|m4v|mpg|mpeg|ogv|flv|wmv|ts|m2ts)$/i;
const SUBTITLE_EXT_REGEX = /\.(srt|ass|ssa|vtt|sub|idx|sup)$/i;
const AUDIO_EXT_REGEX = /\.(flac|mp3|m4a|ogg|opus|wav|aac|ac3|dts)$/i;

export function buildArchiveLuceneQuery(filters: SearchFilters): string {
  const parts: string[] = ['mediatype:movies'];

  // 1. User query
  const q = filters.query.trim();
  const directId = extractDirectArchiveId(q);
  if (directId) {
    return `identifier:"${directId}"`;
  }

  if (q) {
    // Check if user already wrote advanced Lucene operators
    const hasFieldOp = /\b(title|subject|collection|identifier|creator|format|files_count):/i.test(q);
    if (hasFieldOp) {
      parts.push(`(${q})`);
    } else {
      parts.push(`(${q})`);
    }
  }

  // 2. Content category
  if (filters.category === 'anime') {
    parts.push(
      '(subject:(anime OR manga) OR title:anime OR collection:(anime OR anime_miscellaneous))'
    );
  } else if (filters.category === 'series') {
    parts.push(
      '(title:(season OR complete OR episodes OR series OR "S01" OR "S02" OR "1x01") OR subject:(television OR series OR season OR episodes OR tv))'
    );
  }

  // 3. Pack / File count & Folder size preset
  let minFiles = filters.minFiles;
  let minSizeMB = filters.minSizeMB;

  if (filters.packPreset === 'season-pack') {
    minFiles = 12;
    minSizeMB = 250;
  } else if (filters.packPreset === 'large-pack') {
    minFiles = 40;
    minSizeMB = 1024;
  } else if (filters.packPreset === 'any-video') {
    minFiles = 2;
    minSizeMB = 20;
  }

  if (minFiles > 1) {
    parts.push(`files_count:[${minFiles} TO *]`);
  }
  if (minSizeMB > 0) {
    const minBytes = Math.round(minSizeMB * 1024 * 1024);
    parts.push(`item_size:[${minBytes} TO *]`);
  }

  // 4. Video format filter
  switch (filters.videoFormat) {
    case 'mkv':
      parts.push('format:Matroska');
      break;
    case 'mp4':
      parts.push('format:(MPEG4 OR "h.264")');
      break;
    case 'avi':
      parts.push('format:AVI');
      break;
    case 'webm':
      parts.push('format:WebM');
      break;
    default:
      parts.push('format:(Matroska OR MPEG4 OR "h.264" OR AVI OR WebM OR QuickTime OR Ogg)');
      break;
  }

  // 5. SFW / NSFW search filtering
  if (filters.safety === 'sfw') {
    parts.push(
      'NOT subject:(nsfw OR hentai OR ecchi OR uncensored OR xxx OR porn OR erotica OR "18+" OR eroge OR jav OR adult) AND NOT title:(hentai OR ecchi OR uncensored OR xxx OR porn OR nsfw OR "18+" OR erotica)'
    );
  } else if (filters.safety === 'nsfw') {
    parts.push(
      '(subject:(nsfw OR hentai OR ecchi OR uncensored OR adult OR "18+" OR erotica OR mature OR eroge OR lewd) OR title:(nsfw OR hentai OR ecchi OR uncensored OR "18+" OR adult))'
    );
  }

  return parts.join(' AND ');
}

function normalizeStringArray(val: unknown): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.map((v) => String(v));
  return [String(val)];
}

export async function searchArchiveFolders(
  filters: SearchFilters,
  page: number,
  rowsPerPage: number,
  signal?: AbortSignal
): Promise<{ numFound: number; items: ArchiveSearchItem[]; luceneQuery: string }> {
  const directId = extractDirectArchiveId(filters.query);

  // If user pasted a direct folder URL or id:xxx, try fetching metadata directly so even noindex hidden folders resolve!
  if (directId) {
    try {
      const detail = await fetchFolderDetail(directId, signal);
      const item: ArchiveSearchItem = {
        identifier: detail.identifier,
        title: detail.title,
        description: detail.description,
        creator: detail.creator,
        downloads: detail.views?.all_time ?? 0,
        month: detail.views?.last_30day ?? 0,
        week: detail.views?.last_7day ?? 0,
        publicdate: detail.publicdate,
        addeddate: detail.addeddate,
        itemSize: detail.itemSize,
        filesCount: detail.filesCount,
        formats: Array.from(new Set(detail.files.map((f) => f.format))).slice(0, 8),
        subjects: detail.subjects,
        mediatype: 'movies',
        isNsfwDetected: detail.isNsfwDetected,
        isNoIndex: false,
      };
      return {
        numFound: 1,
        items: [item],
        luceneQuery: `identifier:"${directId}" (прямой запрос метаданных)`,
      };
    } catch {
      // Fall back to regular search if direct metadata lookup fails
    }
  }

  const luceneQuery = buildArchiveLuceneQuery(filters);
  const params = new URLSearchParams();
  params.set('q', luceneQuery);

  const fields = [
    'identifier',
    'title',
    'description',
    'creator',
    'downloads',
    'month',
    'week',
    'publicdate',
    'addeddate',
    'item_size',
    'files_count',
    'format',
    'subject',
    'mediatype',
    'noindex',
    'indexflag',
  ];
  for (const f of fields) {
    params.append('fl[]', f);
  }

  if (filters.sort !== 'relevance') {
    params.append('sort[]', filters.sort);
  }

  params.set('rows', String(rowsPerPage));
  params.set('page', String(page));
  params.set('output', 'json');

  const url = `https://archive.org/advancedsearch.php?${params.toString()}`;

  const cached = SEARCH_CACHE.get(url);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return { numFound: cached.numFound, items: cached.items, luceneQuery };
  }

  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 429) {
      throw new Error('Archive.org временно ограничил частоту запросов (HTTP 429). Подождите 10–15 секунд.');
    }
    throw new Error(`Ошибка поискового API Archive.org (HTTP ${res.status})`);
  }

  const data = await res.json();
  const docs: Record<string, unknown>[] = data?.response?.docs || [];
  const numFound: number = Number(data?.response?.numFound || 0);

  const items: ArchiveSearchItem[] = docs.map((doc) => {
    const identifier = String(doc.identifier || '');
    const title = String(doc.title || identifier);
    const description = doc.description ? String(doc.description) : undefined;
    const subjects = normalizeStringArray(doc.subject);
    const formats = normalizeStringArray(doc.format);
    const indexFlags = normalizeStringArray(doc.indexflag);
    const isNoIndex = Boolean(doc.noindex) || indexFlags.includes('noindex');
    const isNsfwDetected = detectNsfwContent(title, description, subjects);

    return {
      identifier,
      title,
      description,
      creator: doc.creator ? normalizeStringArray(doc.creator).join(', ') : undefined,
      downloads: Number(doc.downloads || 0),
      month: Number(doc.month || 0),
      week: Number(doc.week || 0),
      publicdate: doc.publicdate ? String(doc.publicdate) : undefined,
      addeddate: doc.addeddate ? String(doc.addeddate) : undefined,
      itemSize: Number(doc.item_size || 0),
      filesCount: Number(doc.files_count || 0),
      formats,
      subjects,
      mediatype: String(doc.mediatype || 'movies'),
      isNsfwDetected,
      isNoIndex,
    };
  });

  SEARCH_CACHE.set(url, { ts: Date.now(), numFound, items });
  return { numFound, items, luceneQuery };
}

function classifyArchiveFile(raw: Record<string, unknown>): ArchiveFileEntry {
  const name = String(raw.name || '');
  const source = String(raw.source || 'original');
  const format = String(raw.format || '');
  const sizeBytes = Number(raw.size || 0);
  const lengthSeconds = raw.length ? parseFloat(String(raw.length)) : undefined;
  const width = raw.width ? Number(raw.width) : undefined;
  const height = raw.height ? Number(raw.height) : undefined;

  const dotIdx = name.lastIndexOf('.');
  const extension = dotIdx !== -1 ? name.slice(dotIdx + 1).toLowerCase() : '';

  const isThumbPath = name.includes('.thumbs/') || format === 'Thumbnail' || format === 'Item Tile';
  const isVideoExt = VIDEO_EXT_REGEX.test(name);
  const isVideoFormat = /matroska|mpeg4|h\.264|webm|avi|quicktime|ogg video|cinepak/i.test(format);

  let category: FileCategory = 'metadata-other';

  if (!isThumbPath && (isVideoExt || isVideoFormat)) {
    category = source === 'original' ? 'video-original' : 'video-derivative';
  } else if (SUBTITLE_EXT_REGEX.test(name) || /subrip|webvtt|substationalpha/i.test(format)) {
    category = 'subtitle';
  } else if (AUDIO_EXT_REGEX.test(name)) {
    category = 'audio';
  } else if (extension === 'torrent' || /bittorrent/i.test(format)) {
    category = 'torrent';
  }

  return {
    name,
    source,
    format: format || extension.toUpperCase() || 'FILE',
    sizeBytes: isNaN(sizeBytes) ? 0 : sizeBytes,
    lengthSeconds: lengthSeconds && !isNaN(lengthSeconds) ? lengthSeconds : undefined,
    width: width && !isNaN(width) ? width : undefined,
    height: height && !isNaN(height) ? height : undefined,
    md5: raw.md5 ? String(raw.md5) : undefined,
    sha1: raw.sha1 ? String(raw.sha1) : undefined,
    crc32: raw.crc32 ? String(raw.crc32) : undefined,
    mtime: raw.mtime ? Number(raw.mtime) : undefined,
    original: raw.original ? String(raw.original) : undefined,
    category,
    extension,
  };
}

function extractNodeResolutionFromMetadata(
  identifier: string,
  data: Record<string, any>,
  classifiedFiles?: ArchiveFileEntry[]
): NodeResolution {
  const defaultDir = String(data.dir || `/0/items/${identifier}`);
  const d1 = data.d1 ? String(data.d1).trim() : undefined;
  const d2 = data.d2 ? String(data.d2).trim() : undefined;
  const server = data.server ? String(data.server).trim() : undefined;
  const workable: string[] = Array.isArray(data.workable_servers)
    ? data.workable_servers.map(String)
    : [];

  const locations: ServerLocation[] = [];
  const seen = new Set<string>();

  const pushLoc = (host: string | undefined, dir: string, role: ServerLocation['role']) => {
    if (!host || !host.includes('.')) return;
    const cleanHost = host.toLowerCase().trim();
    const key = `${cleanHost}::${dir}`;
    if (seen.has(key)) return;
    seen.add(key);
    const info = parseDomainInfo(cleanHost);
    locations.push({
      server: cleanHost,
      dir,
      role,
      region: info.region,
    });
  };

  pushLoc(d1, defaultDir, 'd1');
  pushLoc(server, defaultDir, 'primary');
  pushLoc(d2, defaultDir, 'd2');
  for (const w of workable) {
    pushLoc(w, defaultDir, 'workable');
  }

  const altServers = data.alternate_locations?.servers;
  if (Array.isArray(altServers)) {
    for (const alt of altServers) {
      if (alt?.server) {
        pushLoc(String(alt.server), String(alt.dir || defaultDir), 'alternate');
      }
    }
  }
  const altWorkable = data.alternate_locations?.workable;
  if (Array.isArray(altWorkable)) {
    for (const alt of altWorkable) {
      if (alt?.server) {
        pushLoc(String(alt.server), String(alt.dir || defaultDir), 'alternate');
      }
    }
  }

  const primaryServer =
    locations[0]?.server || server || d1 || 'archive.org';

  let originalVideoCount: number | undefined;
  let derivativeVideoCount: number | undefined;
  let totalVideoCount: number | undefined;

  if (classifiedFiles) {
    originalVideoCount = classifiedFiles.filter((f) => f.category === 'video-original').length;
    derivativeVideoCount = classifiedFiles.filter((f) => f.category === 'video-derivative').length;
    totalVideoCount = originalVideoCount + derivativeVideoCount;
  }

  const node: NodeResolution = {
    identifier,
    primaryServer,
    dir: locations[0]?.dir || defaultDir,
    d1,
    d2,
    solo: Boolean(data.solo),
    locations,
    originalVideoCount,
    derivativeVideoCount,
    totalVideoCount,
    resolvedAt: Date.now(),
  };

  NODE_CACHE.set(identifier, node);
  return node;
}

export function getCachedNode(identifier: string): NodeResolution | undefined {
  return NODE_CACHE.get(identifier);
}

/**
 * Fetches full folder details (metadata, all file server mirrors, and full file tree)
 */
export async function fetchFolderDetail(
  identifier: string,
  signal?: AbortSignal
): Promise<ArchiveFolderDetail> {
  const cached = FOLDER_DETAIL_CACHE.get(identifier);
  if (cached) return cached;

  const url = `https://archive.org/metadata/${encodeURIComponent(identifier)}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error(`Не удалось загрузить метаданные папки ${identifier} (HTTP ${res.status})`);
  }

  const data = await res.json();
  // IA trap: non-existent item returns HTTP 200 with {}
  if (!data || (!data.metadata && !data.files)) {
    throw new Error(`Папка "${identifier}" не найдена или удалена с Archive.org`);
  }

  const meta = data.metadata || {};
  const rawFiles: Record<string, unknown>[] = Array.isArray(data.files) ? data.files : [];

  const classifiedFiles = rawFiles
    .map(classifyArchiveFile)
    .sort((a, b) => naturalCompare(a.name, b.name));

  const node = extractNodeResolutionFromMetadata(identifier, data, classifiedFiles);

  const title = String(meta.title || identifier);
  const description = Array.isArray(meta.description)
    ? meta.description.join('\n')
    : String(meta.description || '');
  const subjects = normalizeStringArray(meta.subject);
  const collections = normalizeStringArray(meta.collection).filter(
    (c) => !c.startsWith('fav-')
  );

  // Fetch accurate view counts lightly in parallel (non-blocking fallback)
  let views: ArchiveFolderDetail['views'];
  try {
    // Bare GET without custom headers (required by be-api CORS rules)
    const viewsRes = await fetch(
      `https://be-api.us.archive.org/views/v1/short/${encodeURIComponent(identifier)}`,
      { signal }
    );
    if (viewsRes.ok) {
      const viewsJson = await viewsRes.json();
      const v = viewsJson?.[identifier];
      if (v) {
        views = {
          all_time: Number(v.all_time || 0),
          last_30day: Number(v.last_30day || 0),
          last_7day: Number(v.last_7day || 0),
        };
      }
    }
  } catch {
    // Ignore views API errors gracefully
  }

  const detail: ArchiveFolderDetail = {
    identifier,
    title,
    description,
    creator: normalizeStringArray(meta.creator).join(', ') || String(meta.uploader || '—'),
    uploader: meta.uploader ? String(meta.uploader) : undefined,
    publicdate: meta.publicdate ? String(meta.publicdate) : undefined,
    addeddate: meta.addeddate ? String(meta.addeddate) : undefined,
    itemSize: Number(data.item_size || 0),
    filesCount: Number(data.files_count || classifiedFiles.length),
    subjects,
    collections,
    isNsfwDetected: detectNsfwContent(title, description, subjects),
    node,
    files: classifiedFiles,
    views,
  };

  FOLDER_DETAIL_CACHE.set(identifier, detail);
  return detail;
}

/**
 * Lightweight node resolver for scanning a page of folders to harvest *.archive.org domains.
 * For normal folders (<= 750 files), fetches /metadata/{id} once and caches everything.
 * For giant folders (> 750 files), uses partial MDAPI reads (/server, /dir, /alternate_locations)
 * to avoid downloading multi-megabyte file lists during background scans.
 */
export async function resolveFolderNodeLightweight(
  identifier: string,
  estimatedFilesCount = 0,
  signal?: AbortSignal
): Promise<NodeResolution> {
  const existing = NODE_CACHE.get(identifier);
  if (existing) return existing;

  if (estimatedFilesCount <= 750) {
    const detail = await fetchFolderDetail(identifier, signal);
    return detail.node;
  }

  // Partial reads for massive items
  const enc = encodeURIComponent(identifier);
  const [serverRes, dirRes, altRes] = await Promise.all([
    fetch(`https://archive.org/metadata/${enc}/server`, { signal }).then((r) => r.json()).catch(() => ({})),
    fetch(`https://archive.org/metadata/${enc}/dir`, { signal }).then((r) => r.json()).catch(() => ({})),
    fetch(`https://archive.org/metadata/${enc}/alternate_locations`, { signal })
      .then((r) => r.json())
      .catch(() => ({})),
  ]);

  return extractNodeResolutionFromMetadata(identifier, {
    server: serverRes?.result,
    dir: dirRes?.result || `/0/items/${identifier}`,
    alternate_locations: altRes?.result,
  });
}

/**
 * Polite bounded-concurrency scanner to resolve storage domains for an array of items
 */
export async function scanNodesBatch(
  items: Array<{ identifier: string; filesCount: number }>,
  onNodeResolved: (node: NodeResolution) => void,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const queue = [...items];
  const total = queue.length;
  let completed = 0;
  const CONCURRENCY = 3;

  const worker = async () => {
    while (queue.length > 0) {
      if (signal?.aborted) return;
      const next = queue.shift();
      if (!next) return;

      const wasCached = NODE_CACHE.has(next.identifier);
      try {
        const node = await resolveFolderNodeLightweight(
          next.identifier,
          next.filesCount,
          signal
        );
        onNodeResolved(node);
      } catch {
        // Skip failed item politely
      } finally {
        completed += 1;
        onProgress?.(completed, total);
      }

      if (!wasCached && queue.length > 0 && !signal?.aborted) {
        await new Promise((r) => setTimeout(r, 160));
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker()));
}

/**
 * Harvests a broad pool of active *.archive.org video storage domains (dn* / ia*)
 * by sampling popular & recent movie/anime folders via ultra-lightweight partial reads.
 */
export async function harvestPopularVideoDomains(
  sampleCount: number,
  onNodeResolved: (node: NodeResolution) => void,
  onProgress?: (done: number, total: number) => void,
  signal?: AbortSignal
): Promise<void> {
  const half = Math.max(10, Math.floor(sampleCount / 2));
  const urls = [
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      'mediatype:movies AND files_count:[10 TO *]'
    )}&fl[]=identifier&sort[]=downloads+desc&rows=${half}&page=1&output=json`,
    `https://archive.org/advancedsearch.php?q=${encodeURIComponent(
      'mediatype:movies AND (subject:anime OR title:season) AND files_count:[10 TO *]'
    )}&fl[]=identifier&sort[]=publicdate+desc&rows=${half}&page=1&output=json`,
  ];

  const responses = await Promise.all(
    urls.map((u) =>
      fetch(u, { signal })
        .then((r) => r.json())
        .catch(() => null)
    )
  );

  const idSet = new Set<string>();
  for (const r of responses) {
    const docs = r?.response?.docs;
    if (Array.isArray(docs)) {
      for (const d of docs) {
        if (d?.identifier) idSet.add(String(d.identifier));
      }
    }
  }

  // Force lightweight partial read (filesCount = 9999) so each check is ~100 bytes instead of full file trees
  const batchTargets = Array.from(idSet).map((identifier) => ({
    identifier,
    filesCount: 9999,
  }));

  await scanNodesBatch(batchTargets, onNodeResolved, onProgress, signal);
}
