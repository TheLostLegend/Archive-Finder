export type ContentSafetyMode = 'sfw' | 'all' | 'nsfw';

export type ContentCategory = 'all-video' | 'anime' | 'series' | 'movies';

export type SortOption =
  | 'downloads desc'
  | 'month desc'
  | 'week desc'
  | 'publicdate desc'
  | 'publicdate asc'
  | 'addeddate desc'
  | 'item_size desc'
  | 'relevance';

export type PackPreset = 'season-pack' | 'large-pack' | 'any-video' | 'custom';

export type VideoFormatFilter = 'all' | 'mkv' | 'mp4' | 'avi' | 'webm';

export type LayoutViewMode = 'grid' | 'table';

export interface SearchFilters {
  query: string;
  category: ContentCategory;
  safety: ContentSafetyMode;
  sort: SortOption;
  packPreset: PackPreset;
  minFiles: number;
  minSizeMB: number;
  videoFormat: VideoFormatFilter;
  blurNsfwThumbs: boolean;
}

export interface ArchiveSearchItem {
  identifier: string;
  title: string;
  description?: string;
  creator?: string;
  downloads: number;
  month: number;
  week: number;
  publicdate?: string;
  addeddate?: string;
  itemSize: number;
  filesCount: number;
  formats: string[];
  subjects: string[];
  mediatype: string;
  isNsfwDetected: boolean;
  isNoIndex: boolean;
}

export interface ServerLocation {
  server: string;
  dir: string;
  role: 'primary' | 'd1' | 'd2' | 'workable' | 'alternate';
  region: string;
}

export interface NodeResolution {
  identifier: string;
  primaryServer: string;
  dir: string;
  d1?: string;
  d2?: string;
  solo?: boolean;
  locations: ServerLocation[];
  originalVideoCount?: number;
  derivativeVideoCount?: number;
  totalVideoCount?: number;
  resolvedAt: number;
}

export type FileCategory =
  | 'video-original'
  | 'video-derivative'
  | 'subtitle'
  | 'audio'
  | 'torrent'
  | 'metadata-other';

export interface ArchiveFileEntry {
  name: string;
  source: string;
  format: string;
  sizeBytes: number;
  lengthSeconds?: number;
  width?: number;
  height?: number;
  md5?: string;
  sha1?: string;
  crc32?: string;
  mtime?: number;
  original?: string;
  category: FileCategory;
  extension: string;
}

export interface ArchiveFolderDetail {
  identifier: string;
  title: string;
  description: string;
  creator: string;
  uploader?: string;
  publicdate?: string;
  addeddate?: string;
  itemSize: number;
  filesCount: number;
  subjects: string[];
  collections: string[];
  isNsfwDetected: boolean;
  node: NodeResolution;
  files: ArchiveFileEntry[];
  views?: {
    all_time: number;
    last_30day: number;
    last_7day: number;
  };
}

export type ProxyRepoNaming = 'ia-short' | 'short-only' | 'ia-full' | 'single-group';

export interface ProxyMirrorConfig {
  useProxyUrls: boolean;
  proxyBaseUrl: string; // e.g. http://localhost:8081/repository
  repoNaming: ProxyRepoNaming;
  repoPrefix: string; // e.g. "ia-"
  singleGroupName: string; // e.g. "ia-archive-group"
  blobStoreName: string; // e.g. "default"
  strictContentTypeValidation: boolean;
}

export interface DiscoveredDomain {
  domain: string; // e.g. dn801206.us.archive.org
  shortName: string; // e.g. dn801206.us
  nodeType: 'dn' | 'ia' | 'other';
  region: string; // e.g. US, CA, EU
  sampleDir: string;
  folderIds: string[];
  firstSeen: number;
}

export interface QueuedDownloadFile {
  key: string; // identifier::fileName
  identifier: string;
  folderTitle: string;
  server: string;
  dir: string;
  fileName: string;
  sizeBytes: number;
  format: string;
  resolution?: string;
  durationSeconds?: number;
  source: string;
  addedAt: number;
}
