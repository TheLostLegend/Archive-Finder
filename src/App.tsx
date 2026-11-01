import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Code2,
  Database,
  EyeOff,
  FolderSearch,
  Grid,
  List,
  Loader2,
  Minus,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Server,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  Sparkles,
  Square,
  ZoomIn,
} from 'lucide-react';
import {
  ArchiveFolderDetail,
  ArchiveSearchItem,
  ContentCategory,
  ContentSafetyMode,
  DiscoveredDomain,
  LayoutViewMode,
  NodeResolution,
  PackPreset,
  ProxyMirrorConfig,
  QueuedDownloadFile,
  SearchFilters,
  SortOption,
  VideoFormatFilter,
} from './types/archive';
import {
  fetchFolderDetail,
  getCachedNode,
  resolveFolderNodeLightweight,
  scanNodesBatch,
  searchArchiveFolders,
} from './services/archiveApi';
import {
  extractDirectArchiveId,
  formatBytes,
  formatNumber,
  parseDomainInfo,
} from './utils/formatters';
import { DEFAULT_PROXY_CONFIG } from './utils/proxyMirror';
import { FolderCard } from './components/FolderCard';
import { PaginationBar } from './components/PaginationBar';
import { FolderInspectorModal } from './components/FolderInspectorModal';
import {
  ProxyModalTab,
  ProxyWorkspaceModal,
} from './components/ProxyWorkspaceModal';

const ROWS_PER_PAGE = 20;

const LS_PROXY_CONFIG = 'ia_video_vault_proxy_v1';
const LS_DOMAINS = 'ia_video_vault_domains_v1';
const LS_QUEUE = 'ia_video_vault_queue_v1';

const INITIAL_SEED_DOMAIN: DiscoveredDomain = {
  domain: 'dn801206.us.archive.org',
  shortName: 'dn801206.us',
  nodeType: 'dn',
  region: 'US',
  sampleDir: '/0/items/evadubbed',
  folderIds: ['evadubbed'],
  firstSeen: Date.now(),
};

function computeInitialCols(cardMinWidth: number): number {
  if (typeof window === 'undefined') return 4;
  const approxContainer = Math.max(300, window.innerWidth - 48);
  const gap = 12;
  return Math.max(
    1,
    Math.min(10, Math.floor((approxContainer + gap) / (cardMinWidth + gap)))
  );
}

export function App() {
  // Search input draft vs committed search filters
  const [searchInput, setSearchInput] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showLuceneBar, setShowLuceneBar] = useState(false);

  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: 'anime',
    safety: 'sfw',
    sort: 'downloads desc',
    packPreset: 'season-pack',
    minFiles: 12,
    minSizeMB: 250,
    videoFormat: 'all',
    blurNsfwThumbs: true,
  });

  // Responsive 20-Row Grid state
  const [viewMode, setViewMode] = useState<LayoutViewMode>('grid');
  const [cardBaseWidth, setCardBaseWidth] = useState<number>(265);
  const [colsPerRow, setColsPerRow] = useState<number>(() =>
    computeInitialCols(265)
  );
  const gridContainerRef = useRef<HTMLDivElement | null>(null);

  // Pagination & Results state
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [items, setItems] = useState<ArchiveSearchItem[]>([]);
  const [numFound, setNumFound] = useState<number>(0);
  const [activeLuceneQuery, setActiveLuceneQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(true);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState<number>(0);

  // Node resolution map & Page Domain Scanner state
  const [resolvedNodes, setResolvedNodes] = useState<
    Record<string, NodeResolution>
  >({});
  const [resolvingIds, setResolvingIds] = useState<Set<string>>(new Set());
  const [isScanningPage, setIsScanningPage] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const scanAbortRef = useRef<AbortController | null>(null);

  // Folder Inspector Modal state
  const [activeFolderDetail, setActiveFolderDetail] =
    useState<ArchiveFolderDetail | null>(null);
  const [isFolderLoading, setIsFolderLoading] = useState<boolean>(false);
  const [folderError, setFolderError] = useState<string | null>(null);

  // Persistent Proxy Repository Config, Discovered Domains & Download Queue
  const [proxyConfig, setProxyConfig] = useState<ProxyMirrorConfig>(() => {
    try {
      const saved = localStorage.getItem(LS_PROXY_CONFIG);
      if (saved) return { ...DEFAULT_PROXY_CONFIG, ...JSON.parse(saved) };
    } catch {
      // ignore
    }
    return DEFAULT_PROXY_CONFIG;
  });

  const [discoveredDomains, setDiscoveredDomains] = useState<DiscoveredDomain[]>(
    () => {
      try {
        const saved = localStorage.getItem(LS_DOMAINS);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch {
        // ignore
      }
      return [INITIAL_SEED_DOMAIN];
    }
  );

  const [queuedFiles, setQueuedFiles] = useState<QueuedDownloadFile[]>(() => {
    try {
      const saved = localStorage.getItem(LS_QUEUE);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return [];
  });

  const [proxyModalOpen, setProxyModalOpen] = useState<boolean>(false);
  const [proxyModalTab, setProxyModalTab] = useState<ProxyModalTab>('domains');

  // Sync to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LS_PROXY_CONFIG, JSON.stringify(proxyConfig));
    } catch {
      // ignore
    }
  }, [proxyConfig]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_DOMAINS, JSON.stringify(discoveredDomains));
    } catch {
      // ignore
    }
  }, [discoveredDomains]);

  useEffect(() => {
    try {
      localStorage.setItem(LS_QUEUE, JSON.stringify(queuedFiles));
    } catch {
      // ignore
    }
  }, [queuedFiles]);

  // Register any newly discovered *.archive.org servers into Domain Registry
  const registerNodeResolution = useCallback((node: NodeResolution) => {
    setResolvedNodes((prev) => ({ ...prev, [node.identifier]: node }));

    setDiscoveredDomains((prev) => {
      const map = new Map<string, DiscoveredDomain>();
      for (const d of prev) {
        map.set(d.domain, d);
      }

      let changed = false;
      for (const loc of node.locations) {
        const host = loc.server.toLowerCase().trim();
        if (!host.endsWith('.archive.org') || host === 'archive.org') continue;

        const existing = map.get(host);
        if (existing) {
          if (!existing.folderIds.includes(node.identifier)) {
            map.set(host, {
              ...existing,
              folderIds: [node.identifier, ...existing.folderIds].slice(0, 30),
            });
            changed = true;
          }
        } else {
          const info = parseDomainInfo(host);
          map.set(host, {
            domain: host,
            shortName: info.shortName,
            nodeType: info.nodeType,
            region: info.region,
            sampleDir: loc.dir,
            folderIds: [node.identifier],
            firstSeen: Date.now(),
          });
          changed = true;
        }
      }

      if (!changed) return prev;
      return Array.from(map.values()).sort((a, b) =>
        a.domain.localeCompare(b.domain)
      );
    });
  }, []);

  // Measure Grid Container Width (responds dynamically to browser zoom Ctrl+/Ctrl- and card scale!)
  useEffect(() => {
    if (viewMode === 'table') {
      setColsPerRow(1);
      return;
    }

    let debounceTimer: number | undefined;

    const recalcColumns = (width: number) => {
      if (width <= 0) return;
      const gap = 12;
      const computed = Math.max(
        1,
        Math.min(12, Math.floor((width + gap) / (cardBaseWidth + gap)))
      );
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(() => {
        setColsPerRow((prev) => (prev === computed ? prev : computed));
      }, 180);
    };

    const el = gridContainerRef.current;
    if (el) {
      recalcColumns(el.clientWidth);
    }

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        recalcColumns(entry.contentRect.width);
      }
    });

    if (el) observer.observe(el);

    const onWinResize = () => {
      if (gridContainerRef.current) {
        recalcColumns(gridContainerRef.current.clientWidth);
      }
    };
    window.addEventListener('resize', onWinResize);

    return () => {
      window.clearTimeout(debounceTimer);
      observer.disconnect();
      window.removeEventListener('resize', onWinResize);
    };
  }, [viewMode, cardBaseWidth]);

  const effectiveCols = viewMode === 'table' ? 1 : colsPerRow;
  const itemsPerPage = ROWS_PER_PAGE * effectiveCols;

  // Main Search Effect
  useEffect(() => {
    const controller = new AbortController();
    scanAbortRef.current?.abort();
    setIsScanningPage(false);
    setScanProgress(null);

    setIsSearching(true);
    setSearchError(null);

    searchArchiveFolders(filters, currentPage, itemsPerPage, controller.signal)
      .then((res) => {
        setItems(res.items);
        setNumFound(res.numFound);
        setActiveLuceneQuery(res.luceneQuery);

        // Populate already-cached nodes immediately
        const cachedMap: Record<string, NodeResolution> = {};
        for (const it of res.items) {
          const c = getCachedNode(it.identifier);
          if (c) cachedMap[it.identifier] = c;
        }
        if (Object.keys(cachedMap).length > 0) {
          setResolvedNodes((prev) => ({ ...prev, ...cachedMap }));
        }

        // Politely auto-resolve the first 6 folders on the page so users immediately see real dn*/ia* domains
        const autoTargets = res.items
          .filter((it) => !getCachedNode(it.identifier))
          .slice(0, 6)
          .map((it) => ({
            identifier: it.identifier,
            filesCount: it.filesCount,
          }));

        if (autoTargets.length > 0) {
          scanNodesBatch(
            autoTargets,
            (node) => registerNodeResolution(node),
            undefined,
            controller.signal
          );
        }
      })
      .catch((err) => {
        if (err?.name === 'AbortError') return;
        setSearchError(err?.message || 'Ошибка соединения с Archive.org');
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setIsSearching(false);
        }
      });

    return () => controller.abort();
  }, [filters, currentPage, itemsPerPage, refreshTick, registerNodeResolution]);

  // Open folder detail inspector (also updates URL hash for GitHub Pages bookmarking/sharing)
  const handleOpenFolder = useCallback(
    async (identifier: string) => {
      setIsFolderLoading(true);
      setFolderError(null);
      setActiveFolderDetail(null);

      try {
        if (typeof window !== 'undefined') {
          window.history.replaceState(
            null,
            '',
            `#folder=${encodeURIComponent(identifier)}`
          );
        }
      } catch {
        // ignore history error in sandboxed iframes
      }

      try {
        const detail = await fetchFolderDetail(identifier);
        setActiveFolderDetail(detail);
        registerNodeResolution(detail.node);
      } catch (err: any) {
        setFolderError(
          err?.message || `Не удалось получить список файлов папки ${identifier}`
        );
      } finally {
        setIsFolderLoading(false);
      }
    },
    [registerNodeResolution]
  );

  const handleCloseFolder = useCallback(() => {
    setActiveFolderDetail(null);
    setFolderError(null);
    setIsFolderLoading(false);
    try {
      if (typeof window !== 'undefined' && window.location.hash.startsWith('#folder=')) {
        window.history.replaceState(
          null,
          '',
          window.location.pathname + window.location.search
        );
      }
    } catch {
      // ignore
    }
  }, []);

  // Support opening `#folder=<id>` on initial page load (100% static GitHub Pages compatible)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const match = window.location.hash.match(/^#folder=([^&]+)/);
    if (match && match[1]) {
      const folderId = decodeURIComponent(match[1]);
      if (folderId) {
        handleOpenFolder(folderId);
      }
    }
  }, [handleOpenFolder]);

  // Resolve single card's storage node on click
  const handleResolveSingleNode = useCallback(
    async (identifier: string, filesCount: number) => {
      setResolvingIds((prev) => new Set(prev).add(identifier));
      try {
        const node = await resolveFolderNodeLightweight(identifier, filesCount);
        registerNodeResolution(node);
      } catch {
        // ignore
      } finally {
        setResolvingIds((prev) => {
          const next = new Set(prev);
          next.delete(identifier);
          return next;
        });
      }
    },
    [registerNodeResolution]
  );

  // Batch scan ALL folders on current page to harvest their storage domains
  const handleScanCurrentPageDomains = () => {
    if (isScanningPage) {
      scanAbortRef.current?.abort();
      setIsScanningPage(false);
      setScanProgress(null);
      return;
    }

    const targets = items.map((it) => ({
      identifier: it.identifier,
      filesCount: it.filesCount,
    }));
    if (targets.length === 0) return;

    const controller = new AbortController();
    scanAbortRef.current = controller;
    setIsScanningPage(true);
    setScanProgress({ done: 0, total: targets.length });

    scanNodesBatch(
      targets,
      (node) => registerNodeResolution(node),
      (done, total) => setScanProgress({ done, total }),
      controller.signal
    ).finally(() => {
      if (!controller.signal.aborted) {
        setIsScanningPage(false);
        setScanProgress(null);
      }
    });
  };

  // Search form submit
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = searchInput.trim();
    const directId = extractDirectArchiveId(trimmed);

    // If user pasted a direct URL like https://dn801206.us.archive.org/0/items/evadubbed/, open it right away too!
    if (directId) {
      handleOpenFolder(directId);
    }

    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, query: trimmed }));
  };

  const applyQuickPreset = (queryText: string, category?: ContentCategory) => {
    setSearchInput(queryText);
    setCurrentPage(1);
    setFilters((prev) => ({
      ...prev,
      query: queryText,
      category: category ?? prev.category,
    }));
  };

  const updateFilter = <K extends keyof SearchFilters>(
    key: K,
    value: SearchFilters[K]
  ) => {
    setCurrentPage(1);
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  // Queue helpers
  const queuedKeysSet = useMemo(
    () => new Set(queuedFiles.map((f) => f.key)),
    [queuedFiles]
  );

  const queuedCountByFolder = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of queuedFiles) {
      counts[f.identifier] = (counts[f.identifier] || 0) + 1;
    }
    return counts;
  }, [queuedFiles]);

  const totalQueuedBytes = useMemo(
    () => queuedFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
    [queuedFiles]
  );

  const handleAddFilesToQueue = useCallback((newFiles: QueuedDownloadFile[]) => {
    setQueuedFiles((prev) => {
      const map = new Map<string, QueuedDownloadFile>();
      for (const f of prev) map.set(f.key, f);
      for (const nf of newFiles) map.set(nf.key, nf);
      return Array.from(map.values());
    });
  }, []);

  const handleRemoveFileKeysFromQueue = useCallback((keys: string[]) => {
    const toRemove = new Set(keys);
    setQueuedFiles((prev) => prev.filter((f) => !toRemove.has(f.key)));
  }, []);

  const handleAddManualDomain = (rawInput: string) => {
    let host = rawInput.trim().toLowerCase();
    try {
      if (host.startsWith('http://') || host.startsWith('https://')) {
        host = new URL(host).hostname.toLowerCase();
      } else if (host.includes('/')) {
        host = host.split('/')[0];
      }
    } catch {
      // ignore URL parse error
    }
    if (!host || !host.includes('.')) return;
    if (!host.endsWith('.archive.org') && !host.includes('archive.org')) {
      host = `${host.replace(/\.$/, '')}.archive.org`;
    }

    const info = parseDomainInfo(host);
    setDiscoveredDomains((prev) => {
      if (prev.some((d) => d.domain === host)) return prev;
      return [
        ...prev,
        {
          domain: host,
          shortName: info.shortName,
          nodeType: info.nodeType,
          region: info.region,
          sampleDir: '/',
          folderIds: [],
          firstSeen: Date.now(),
        },
      ].sort((a, b) => a.domain.localeCompare(b.domain));
    });
  };

  const resolvedOnCurrentPage = useMemo(
    () => items.filter((it) => Boolean(resolvedNodes[it.identifier])).length,
    [items, resolvedNodes]
  );

  return (
    <div className="min-h-screen flex flex-col bg-[#0B0E14] text-slate-100">
      {/* Top Sticky Console Header */}
      <header className="sticky top-0 z-30 bg-[#0D111A]/95 backdrop-blur-md border-b border-[#1E2738]">
        <div className="max-w-[1800px] mx-auto px-3 sm:px-6 py-3 flex flex-wrap items-center justify-between gap-3">
          {/* Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500/25 to-emerald-500/20 border border-sky-400/35 flex items-center justify-center shadow-inner">
              <FolderSearch className="w-5 h-5 text-sky-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm sm:text-base font-bold tracking-tight text-white">
                  IA Video Folder Vault
                </h1>
                <span className="hidden md:inline-block px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-[10px] font-mono text-sky-300">
                  archive.org → dn/ia nodes
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden sm:block">
                Библиотека многофайловых видеопапок (сезоны аниме, сериалы, фильмы) и прямых файловых доменов
              </p>
            </div>
          </div>

          {/* Right Quick Actions: Proxy URL Toggle, Discovered Domains, Download Queue */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setProxyConfig((prev) => ({
                  ...prev,
                  useProxyUrls: !prev.useProxyUrls,
                }))
              }
              title="Переключить формат копируемых ссылок: напрямую с нод Archive.org или через локальный прокси-репозиторий"
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                proxyConfig.useProxyUrls
                  ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                  : 'bg-[#151C2B] hover:bg-[#1B2437] border-[#27344D] text-slate-300'
              }`}
            >
              <Server className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden md:inline">Режим ссылок:</span>
              <strong>
                {proxyConfig.useProxyUrls ? 'Прокси-сервер' : 'Прямые ноды'}
              </strong>
            </button>

            <button
              type="button"
              onClick={() => {
                setProxyModalTab('domains');
                setProxyModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#151C2B] hover:bg-[#1D273B] border border-[#2A3854] text-xs font-medium text-sky-200 transition-colors"
            >
              <Database className="w-3.5 h-3.5 text-sky-400" />
              <span>Файловые домены:</span>
              <span className="px-1.5 py-0.2 rounded bg-sky-500/20 font-mono font-bold text-sky-300">
                {discoveredDomains.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                setProxyModalTab('queue');
                setProxyModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-xs font-semibold text-emerald-200 transition-colors"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-emerald-400" />
              <span>Корзина:</span>
              <span className="font-mono font-bold">{queuedFiles.length}</span>
              {totalQueuedBytes > 0 && (
                <span className="hidden sm:inline font-mono text-[11px] text-emerald-300/90">
                  ({formatBytes(totalQueuedBytes)})
                </span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="flex-1 max-w-[1800px] w-full mx-auto px-3 sm:px-6 py-4 space-y-4">
        {/* Search & Filter Control Panel */}
        <section className="p-4 bg-[#111620] border border-[#222C3E] rounded-2xl space-y-3.5 shadow-lg">
          {/* Primary Search Input Row */}
          <form onSubmit={handleSearchSubmit} className="flex flex-col md:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Поиск аниме, сериалов, фильмов ИЛИ прямая ссылка/ID папки (напр. evadubbed или https://dn801206.us.archive.org/0/items/evadubbed/)"
                className="w-full pl-10 pr-24 py-2.5 rounded-xl bg-[#090C12] border border-[#28354E] focus:border-sky-400 focus:outline-none text-sm text-white placeholder:text-slate-500"
              />
              {searchInput && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput('');
                    setCurrentPage(1);
                    setFilters((prev) => ({ ...prev, query: '' }));
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800/80"
                >
                  Сброс
                </button>
              )}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="submit"
                disabled={isSearching}
                className="flex-1 md:flex-none inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-sky-500 hover:bg-sky-400 disabled:opacity-50 text-sm font-bold text-[#04111D] transition-colors cursor-pointer"
              >
                {isSearching ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                Найти папки
              </button>

              <button
                type="button"
                onClick={() => setShowAdvanced((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border text-xs font-medium transition-colors ${
                  showAdvanced
                    ? 'bg-sky-500/15 border-sky-400/50 text-sky-200'
                    : 'bg-[#161E2E] hover:bg-[#1E293F] border-[#27344E] text-slate-300'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                <span className="hidden sm:inline">Параметры</span>
              </button>
            </div>
          </form>

          {/* Quick Showcase Chips */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="text-slate-500 mr-1">Быстрый выбор:</span>
            <button
              type="button"
              onClick={() => handleOpenFolder('evadubbed')}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-200 font-mono text-[11px] transition-colors"
            >
              <Sparkles className="w-3 h-3 text-emerald-400" />
              evadubbed (Evangelion • dn801206.us)
            </button>

            {[
              { label: 'Все сезоны аниме', q: '', cat: 'anime' as ContentCategory },
              { label: 'Evangelion', q: 'evangelion', cat: 'anime' as ContentCategory },
              {
                label: 'Serial Experiments Lain',
                q: 'Serial Experiments Lain',
                cat: 'anime' as ContentCategory,
              },
              { label: 'Cowboy Bebop', q: 'Cowboy Bebop', cat: 'anime' as ContentCategory },
              { label: 'Death Note', q: 'Death Note', cat: 'anime' as ContentCategory },
              { label: 'Berserk', q: 'Berserk', cat: 'anime' as ContentCategory },
              {
                label: '1080p x265 MKV',
                q: '1080p x265',
                cat: 'all-video' as ContentCategory,
              },
              {
                label: 'Сериалы S01',
                q: 'Season 1 Complete',
                cat: 'series' as ContentCategory,
              },
            ].map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => applyQuickPreset(chip.q, chip.cat)}
                className="px-2.5 py-1 rounded-lg bg-[#161E2D] hover:bg-[#202B40] border border-[#25324A] text-slate-300 hover:text-white text-[11px] transition-colors"
              >
                {chip.label}
              </button>
            ))}
          </div>

          {/* Primary Filter Row: Category + Pack Size + Sort + SFW/NSFW */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5 pt-1 border-t border-[#1C2536]">
            {/* 1. Content Category */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Раздел библиотеки
              </label>
              <div className="grid grid-cols-4 bg-[#0A0D14] p-1 rounded-lg border border-[#232F46] text-xs">
                {(
                  [
                    { id: 'anime', label: 'Аниме' },
                    { id: 'series', label: 'Сериалы' },
                    { id: 'movies', label: 'Фильмы' },
                    { id: 'all-video', label: 'Все' },
                  ] as Array<{ id: ContentCategory; label: string }>
                ).map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => updateFilter('category', cat.id)}
                    className={`py-1 rounded-md font-medium transition-colors ${
                      filters.category === cat.id
                        ? 'bg-sky-500 text-[#04111D] font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. Folder Pack Preset (Multi-file season filter) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Наполнение папки (сезоны / паки)
              </label>
              <select
                value={filters.packPreset}
                onChange={(e) =>
                  updateFilter('packPreset', e.target.value as PackPreset)
                }
                className="w-full px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#232F46] text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="season-pack">
                  Сезоны и паки (12+ файлов в папке, &gt;250 МБ)
                </option>
                <option value="large-pack">
                  Крупные сборники (40+ файлов, &gt;1 ГБ)
                </option>
                <option value="any-video">
                  Все видеопапки и одиночные фильмы (2+ файла)
                </option>
                <option value="custom">Свой порог файлов и размера...</option>
              </select>
            </div>

            {/* 3. Sort Order (Views & Upload Date) */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Сортировка папок
              </label>
              <select
                value={filters.sort}
                onChange={(e) => updateFilter('sort', e.target.value as SortOption)}
                className="w-full px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#232F46] text-xs text-slate-100 focus:outline-none focus:border-sky-500"
              >
                <option value="downloads desc">
                  По просмотрам папки (за всё время ↓)
                </option>
                <option value="month desc">
                  По просмотрам папки (в тренде за 30 дней ↓)
                </option>
                <option value="week desc">
                  По просмотрам папки (за 7 дней ↓)
                </option>
                <option value="publicdate desc">
                  По дате выкладывания (сначала новые ↓)
                </option>
                <option value="publicdate asc">
                  По дате выкладывания (сначала старые ↑)
                </option>
                <option value="addeddate desc">
                  По дате загрузки на сервер (новые ↓)
                </option>
                <option value="item_size desc">
                  По объёму папки (сначала крупные ГБ ↓)
                </option>
                <option value="relevance">По релевантности запросу</option>
              </select>
            </div>

            {/* 4. SFW / ALL / NSFW 18+ Search Mode */}
            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Фильтр контента (SFW / NSFW)
              </label>
              <div className="grid grid-cols-3 bg-[#0A0D14] p-1 rounded-lg border border-[#232F46] text-xs">
                {(
                  [
                    {
                      id: 'sfw',
                      label: 'SFW',
                      icon: ShieldCheck,
                      activeClass: 'bg-emerald-500 text-[#03150C] font-bold',
                    },
                    {
                      id: 'all',
                      label: 'Все',
                      icon: Shield,
                      activeClass: 'bg-amber-400 text-[#180E02] font-bold',
                    },
                    {
                      id: 'nsfw',
                      label: 'NSFW 18+',
                      icon: ShieldAlert,
                      activeClass: 'bg-rose-500 text-white font-bold',
                    },
                  ] as Array<{
                    id: ContentSafetyMode;
                    label: string;
                    icon: React.FC<{ className?: string }>;
                    activeClass: string;
                  }>
                ).map((mode) => {
                  const Icon = mode.icon;
                  const active = filters.safety === mode.id;
                  return (
                    <button
                      key={mode.id}
                      type="button"
                      onClick={() => updateFilter('safety', mode.id)}
                      className={`inline-flex items-center justify-center gap-1 py-1 rounded-md font-medium transition-colors ${
                        active ? mode.activeClass : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {mode.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Expandable Advanced Parameters */}
          {(showAdvanced || filters.packPreset === 'custom') && (
            <div className="pt-3 border-t border-[#1C2536] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Видеоконтейнер в папке
                </label>
                <select
                  value={filters.videoFormat}
                  onChange={(e) =>
                    updateFilter('videoFormat', e.target.value as VideoFormatFilter)
                  }
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#232F46] text-slate-100"
                >
                  <option value="all">
                    Любой видеоформат (MKV / MP4 / AVI / WebM)
                  </option>
                  <option value="mkv">Только с Matroska (.MKV)</option>
                  <option value="mp4">Только с MPEG-4 / H.264 (.MP4)</option>
                  <option value="avi">Только с .AVI</option>
                  <option value="webm">Только с .WebM</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Мин. объектов в папке (вкл. мета-файлы)
                </label>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={filters.minFiles}
                  onChange={(e) => {
                    const v = Math.max(1, parseInt(e.target.value || '1', 10));
                    setCurrentPage(1);
                    setFilters((prev) => ({
                      ...prev,
                      packPreset: 'custom',
                      minFiles: v,
                    }));
                  }}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#232F46] font-mono text-slate-100"
                />
              </div>

              <div>
                <label className="block text-[11px] text-slate-400 mb-1">
                  Мин. общий размер папки (МБ)
                </label>
                <input
                  type="number"
                  min={0}
                  step={50}
                  value={filters.minSizeMB}
                  onChange={(e) => {
                    const v = Math.max(0, parseInt(e.target.value || '0', 10));
                    setCurrentPage(1);
                    setFilters((prev) => ({
                      ...prev,
                      packPreset: 'custom',
                      minSizeMB: v,
                    }));
                  }}
                  className="w-full px-3 py-1.5 rounded-lg bg-[#0A0D14] border border-[#232F46] font-mono text-slate-100"
                />
              </div>

              <div className="flex flex-col justify-end gap-2">
                <label className="inline-flex items-center gap-2 cursor-pointer select-none text-slate-300">
                  <input
                    type="checkbox"
                    checked={filters.blurNsfwThumbs}
                    onChange={(e) =>
                      setFilters((prev) => ({
                        ...prev,
                        blurNsfwThumbs: e.target.checked,
                      }))
                    }
                    className="rounded border-slate-600 bg-slate-900 text-sky-500"
                  />
                  <EyeOff className="w-3.5 h-3.5 text-slate-400" />
                  Размывать обложки 18+ папок
                </label>

                <button
                  type="button"
                  onClick={() => setShowLuceneBar((v) => !v)}
                  className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300 self-start"
                >
                  <Code2 className="w-3.5 h-3.5" />
                  {showLuceneBar
                    ? 'Скрыть Lucene-запрос IA'
                    : 'Показать Lucene-запрос IA'}
                </button>
              </div>
            </div>
          )}

          {showLuceneBar && activeLuceneQuery && (
            <div className="px-3 py-2 rounded-lg bg-[#080B10] border border-[#1E293D] text-[11px] font-mono text-slate-300 break-all">
              <span className="text-sky-400 mr-2">Lucene q=</span>
              {activeLuceneQuery}
            </div>
          )}
        </section>

        {/* Grid Scale, View Mode & Page Domain Scanner Toolbar */}
        <section className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 px-4 py-2.5 bg-[#111620] border border-[#222C3E] rounded-xl text-xs">
          {/* Left: Live 20-Row Scale Indicator & Card Density Controls */}
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-[#0A0D14] p-0.5 rounded-lg border border-[#243048]">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${
                  viewMode === 'grid'
                    ? 'bg-sky-500 text-[#04111D] font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Grid className="w-3.5 h-3.5" />
                Сетка (20 строк × авто-ширина)
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-medium ${
                  viewMode === 'table'
                    ? 'bg-sky-500 text-[#04111D] font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <List className="w-3.5 h-3.5" />
                Таблица (20 строк)
              </button>
            </div>

            {viewMode === 'grid' && (
              <div
                title="Ширина строки в папках автоматически меняется при масштабировании браузера (Ctrl+ / Ctrl-) или кнопками плотности ниже"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#0A0D14] border border-[#243048] text-slate-300"
              >
                <ZoomIn className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-slate-400">Плотность папок в ряду:</span>
                <button
                  type="button"
                  onClick={() => setCardBaseWidth((w) => Math.min(380, w + 30))}
                  title="Крупнее карточки (меньше папок в строке)"
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-300"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <span className="font-mono font-bold text-sky-300 px-1">
                  {effectiveCols} в ряд ({itemsPerPage}/стр)
                </span>
                <button
                  type="button"
                  onClick={() => setCardBaseWidth((w) => Math.max(185, w - 30))}
                  title="Компактнее карточки (больше папок в строке)"
                  className="p-0.5 rounded hover:bg-slate-800 text-slate-300"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>

          {/* Right: Batch Domain Harvester for Current Page */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-slate-400 font-mono text-[11px]">
              Ноды определены: {resolvedOnCurrentPage}/{items.length}
            </span>

            <button
              type="button"
              disabled={items.length === 0 || isSearching}
              onClick={handleScanCurrentPageDomains}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                isScanningPage
                  ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                  : 'bg-sky-500/15 hover:bg-sky-500/25 border-sky-500/35 text-sky-200'
              }`}
            >
              {isScanningPage ? (
                <>
                  <Square className="w-3.5 h-3.5 text-amber-300 fill-amber-300" />
                  Стоп ({scanProgress?.done ?? 0}/{scanProgress?.total ?? items.length})
                </>
              ) : (
                <>
                  <Radar className="w-3.5 h-3.5 text-sky-400" />
                  Собрать все домены страницы
                </>
              )}
            </button>

            <button
              type="button"
              disabled={isSearching}
              onClick={() => setRefreshTick((t) => t + 1)}
              title="Обновить выдачу"
              className="p-1.5 rounded-lg bg-[#171F2E] hover:bg-[#222E44] border border-[#273349] text-slate-300"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSearching ? 'animate-spin' : ''}`}
              />
            </button>
          </div>
        </section>

        {/* Top Pagination Bar */}
        {!searchError && numFound > 0 && (
          <PaginationBar
            currentPage={currentPage}
            totalItems={numFound}
            colsPerRow={effectiveCols}
            rowsCount={ROWS_PER_PAGE}
            isLoading={isSearching}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}

        {/* Results Grid / Table Container (Measured by ResizeObserver for 20-Row Dynamic Columns) */}
        <div ref={gridContainerRef} className="w-full min-h-[420px]">
          {searchError ? (
            <div className="p-8 rounded-2xl bg-rose-950/20 border border-rose-500/30 text-center space-y-3">
              <AlertCircle className="w-8 h-8 text-rose-400 mx-auto" />
              <div className="text-sm font-semibold text-rose-200">
                {searchError}
              </div>
              <p className="text-xs text-slate-400 max-w-lg mx-auto">
                Проверьте подключение к интернету или доступность API archive.org, затем попробуйте снова.
              </p>
              <button
                type="button"
                onClick={() => setRefreshTick((t) => t + 1)}
                className="px-4 py-2 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-xs font-semibold text-rose-200"
              >
                Повторить запрос
              </button>
            </div>
          ) : isSearching ? (
            <div
              style={
                viewMode === 'grid'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
                      gap: '12px',
                    }
                  : undefined
              }
              className={viewMode === 'table' ? 'space-y-2' : ''}
            >
              {Array.from({
                length: Math.min(itemsPerPage, effectiveCols * 4),
              }).map((_, i) => (
                <div
                  key={i}
                  className={`rounded-xl bg-[#111620] border border-[#1E2738] animate-pulse ${
                    viewMode === 'table' ? 'h-16' : 'h-64'
                  }`}
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="py-20 px-6 rounded-2xl bg-[#111620] border border-[#222C3E] text-center space-y-3">
              <FolderSearch className="w-10 h-10 text-slate-600 mx-auto" />
              <div className="text-base font-semibold text-slate-200">
                По вашему запросу папок не найдено
              </div>
              <p className="text-xs text-slate-400 max-w-md mx-auto">
                Попробуйте переключить фильтр наполнения на «Все видеопапки (2+ файла)», сменить раздел на «Все» или ослабить SFW/NSFW ограничения.
              </p>
              <button
                type="button"
                onClick={() =>
                  setFilters((prev) => ({
                    ...prev,
                    category: 'all-video',
                    packPreset: 'any-video',
                  }))
                }
                className="px-4 py-2 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-semibold text-sky-200"
              >
                Искать по всем видеоразделам без ограничения размера
              </button>
            </div>
          ) : (
            <div
              style={
                viewMode === 'grid'
                  ? {
                      display: 'grid',
                      gridTemplateColumns: `repeat(${effectiveCols}, minmax(0, 1fr))`,
                      gap: '12px',
                    }
                  : undefined
              }
              className={viewMode === 'table' ? 'space-y-2' : ''}
            >
              {items.map((item) => (
                <FolderCard
                  key={item.identifier}
                  item={item}
                  node={resolvedNodes[item.identifier]}
                  viewMode={viewMode}
                  proxyConfig={proxyConfig}
                  blurNsfwThumbs={filters.blurNsfwThumbs}
                  queuedCountForFolder={queuedCountByFolder[item.identifier] || 0}
                  isResolvingNode={resolvingIds.has(item.identifier)}
                  onOpenFolder={handleOpenFolder}
                  onResolveNode={handleResolveSingleNode}
                />
              ))}
            </div>
          )}
        </div>

        {/* Bottom Pagination Bar */}
        {!searchError && !isSearching && items.length > 0 && (
          <PaginationBar
            currentPage={currentPage}
            totalItems={numFound}
            colsPerRow={effectiveCols}
            rowsCount={ROWS_PER_PAGE}
            isLoading={isSearching}
            onPageChange={(page) => {
              setCurrentPage(page);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
          />
        )}
      </main>

      {/* Footer Info for GitHub Pages */}
      <footer className="mt-8 border-t border-[#1A2232] bg-[#090C11] py-4 px-4 sm:px-6 text-[11px] text-slate-500">
        <div className="max-w-[1800px] mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div>
            Статический <code className="text-slate-400">index.html</code> клиент для{' '}
            <strong className="text-slate-300">GitHub Pages</strong> • Работает напрямую с CORS API{' '}
            <code className="text-slate-400">archive.org/advancedsearch.php</code> и{' '}
            <code className="text-slate-400">archive.org/metadata/&#123;id&#125;</code>
          </div>
          <div className="font-mono text-slate-400">
            Сетка: {ROWS_PER_PAGE} строк × {effectiveCols} кол. • Файловых доменов:{' '}
            {formatNumber(discoveredDomains.length)}
          </div>
        </div>
      </footer>

      {/* Folder Detail & Direct File Links Modal */}
      {(isFolderLoading || folderError || activeFolderDetail) && (
        <FolderInspectorModal
          detail={activeFolderDetail}
          isLoading={isFolderLoading}
          error={folderError}
          proxyConfig={proxyConfig}
          queuedKeys={queuedKeysSet}
          onClose={handleCloseFolder}
          onToggleProxyMode={(enabled) =>
            setProxyConfig((prev) => ({ ...prev, useProxyUrls: enabled }))
          }
          onAddFilesToQueue={handleAddFilesToQueue}
          onRemoveFileKeysFromQueue={handleRemoveFileKeysFromQueue}
          onOpenProxyModal={() => {
            setProxyModalTab('proxy-config');
            setProxyModalOpen(true);
          }}
        />
      )}

      {/* Proxy Repository Configurator, Domain Registry & Download Queue Modal */}
      <ProxyWorkspaceModal
        isOpen={proxyModalOpen}
        initialTab={proxyModalTab}
        discoveredDomains={discoveredDomains}
        queuedFiles={queuedFiles}
        proxyConfig={proxyConfig}
        onClose={() => setProxyModalOpen(false)}
        onUpdateProxyConfig={(patch) =>
          setProxyConfig((prev) => ({ ...prev, ...patch }))
        }
        onAddManualDomain={handleAddManualDomain}
        onRemoveDomain={(dom) =>
          setDiscoveredDomains((prev) => prev.filter((d) => d.domain !== dom))
        }
        onClearDomains={() => setDiscoveredDomains([])}
        onRemoveQueueKey={(key) =>
          setQueuedFiles((prev) => prev.filter((f) => f.key !== key))
        }
        onClearQueue={() => setQueuedFiles([])}
        onOpenFolderById={handleOpenFolder}
        onRegisterNode={registerNodeResolution}
      />
    </div>
  );
}
export default App;
