import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Film,
  FolderOpen,
  HardDrive,
  Loader2,
  Play,
  Plus,
  Search,
  Server,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  ArchiveFileEntry,
  ArchiveFolderDetail,
  ProxyMirrorConfig,
  QueuedDownloadFile,
  ServerLocation,
} from '../types/archive';
import {
  formatBytes,
  formatDate,
  formatDuration,
  formatNumber,
} from '../utils/formatters';
import {
  buildActiveFileUrl,
  buildDirectFileUrl,
  buildDirectFolderUrl,
  buildProxyFolderUrl,
  getProxyRepoNameForDomain,
} from '../utils/proxyMirror';
import { SafeDescription } from './SafeDescription';

type FileTab = 'originals' | 'derivatives' | 'all-video' | 'extras' | 'all';

interface FolderInspectorModalProps {
  detail: ArchiveFolderDetail | null;
  isLoading: boolean;
  error: string | null;
  proxyConfig: ProxyMirrorConfig;
  queuedKeys: Set<string>;
  onClose: () => void;
  onToggleProxyMode: (enabled: boolean) => void;
  onAddFilesToQueue: (files: QueuedDownloadFile[]) => void;
  onRemoveFileKeysFromQueue: (keys: string[]) => void;
  onOpenProxyModal: () => void;
}

export const FolderInspectorModal: React.FC<FolderInspectorModalProps> = ({
  detail,
  isLoading,
  error,
  proxyConfig,
  queuedKeys,
  onClose,
  onToggleProxyMode,
  onAddFilesToQueue,
  onRemoveFileKeysFromQueue,
  onOpenProxyModal,
}) => {
  const [selectedMirrorIdx, setSelectedMirrorIdx] = useState(0);
  const [activeTab, setActiveTab] = useState<FileTab>('originals');
  const [fileSearch, setFileSearch] = useState('');
  const [selectedNames, setSelectedNames] = useState<Set<string>>(new Set());
  const [previewFile, setPreviewFile] = useState<ArchiveFileEntry | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const counts = useMemo(() => {
    if (!detail) {
      return { originals: 0, derivatives: 0, allVideo: 0, extras: 0, all: 0 };
    }
    let originals = 0;
    let derivatives = 0;
    let extras = 0;
    for (const f of detail.files) {
      if (f.category === 'video-original') originals++;
      else if (f.category === 'video-derivative') derivatives++;
      else if (
        f.category === 'subtitle' ||
        f.category === 'audio' ||
        f.category === 'torrent'
      ) {
        extras++;
      }
    }
    return {
      originals,
      derivatives,
      allVideo: originals + derivatives,
      extras,
      all: detail.files.length,
    };
  }, [detail]);

  // Reset state when a new folder opens
  useEffect(() => {
    if (!detail) return;
    setSelectedMirrorIdx(0);
    setFileSearch('');
    setPreviewFile(null);
    if (counts.originals > 0) setActiveTab('originals');
    else if (counts.allVideo > 0) setActiveTab('all-video');
    else setActiveTab('all');
  }, [detail?.identifier]);

  const activeLocation: ServerLocation | null = useMemo(() => {
    if (!detail) return null;
    return (
      detail.node.locations[selectedMirrorIdx] ||
      detail.node.locations[0] || {
        server: detail.node.primaryServer,
        dir: detail.node.dir,
        role: 'primary',
        region: 'US',
      }
    );
  }, [detail, selectedMirrorIdx]);

  const visibleFiles = useMemo(() => {
    if (!detail) return [];
    const q = fileSearch.trim().toLowerCase();
    return detail.files.filter((f) => {
      if (activeTab === 'originals' && f.category !== 'video-original') return false;
      if (activeTab === 'derivatives' && f.category !== 'video-derivative') return false;
      if (
        activeTab === 'all-video' &&
        f.category !== 'video-original' &&
        f.category !== 'video-derivative'
      ) {
        return false;
      }
      if (
        activeTab === 'extras' &&
        f.category !== 'subtitle' &&
        f.category !== 'audio' &&
        f.category !== 'torrent'
      ) {
        return false;
      }
      if (q && !f.name.toLowerCase().includes(q) && !f.format.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
  }, [detail, activeTab, fileSearch]);

  // Pre-select visible video files for quick 1-click batch operations
  useEffect(() => {
    if (!detail) return;
    setSelectedNames(new Set(visibleFiles.map((f) => f.name)));
  }, [detail?.identifier, activeTab]);

  // Close on Escape
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const triggerCopy = (key: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 1800);
  };

  if (!isLoading && !error && !detail) return null;

  const toggleSelectFile = (name: string) => {
    setSelectedNames((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const allVisibleSelected =
    visibleFiles.length > 0 && visibleFiles.every((f) => selectedNames.has(f.name));

  const toggleSelectAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedNames(new Set());
    } else {
      setSelectedNames(new Set(visibleFiles.map((f) => f.name)));
    }
  };

  const selectedFileEntries = visibleFiles.filter((f) => selectedNames.has(f.name));
  const selectedTotalBytes = selectedFileEntries.reduce((acc, f) => acc + f.sizeBytes, 0);

  const toQueuedItem = (f: ArchiveFileEntry): QueuedDownloadFile => {
    const srv = activeLocation?.server || detail!.node.primaryServer;
    const dir = activeLocation?.dir || detail!.node.dir;
    return {
      key: `${detail!.identifier}::${f.name}`,
      identifier: detail!.identifier,
      folderTitle: detail!.title,
      server: srv,
      dir,
      fileName: f.name,
      sizeBytes: f.sizeBytes,
      format: f.format,
      resolution: f.width && f.height ? `${f.width}×${f.height}` : undefined,
      durationSeconds: f.lengthSeconds,
      source: f.source,
      addedAt: Date.now(),
    };
  };

  const handleAddSelectedToQueue = () => {
    if (!detail || selectedFileEntries.length === 0) return;
    onAddFilesToQueue(selectedFileEntries.map(toQueuedItem));
    triggerCopy('added-queue', '');
  };

  const handleCopySelectedUrls = () => {
    if (!detail || !activeLocation || selectedFileEntries.length === 0) return;
    const urls = selectedFileEntries
      .map((f) =>
        buildActiveFileUrl(activeLocation.server, activeLocation.dir, f.name, proxyConfig)
      )
      .join('\n');
    triggerCopy('bulk-urls', urls);
  };

  // Find derivative MP4 counterpart for previewing x265 MKVs in browser
  const findDerivativeMp4 = (file: ArchiveFileEntry): ArchiveFileEntry | undefined => {
    if (!detail) return undefined;
    if (file.extension === 'mp4' || file.extension === 'webm') return undefined;
    return detail.files.find(
      (cand) =>
        cand.category === 'video-derivative' &&
        (cand.original === file.name ||
          cand.name.replace(/\.[^.]+$/, '') === file.name.replace(/\.[^.]+$/, '')) &&
        cand.extension === 'mp4'
    );
  };

  const directFolderUrl =
    detail && activeLocation
      ? buildDirectFolderUrl(activeLocation.server, activeLocation.dir)
      : '';
  const proxyFolderUrl =
    detail && activeLocation
      ? buildProxyFolderUrl(activeLocation.server, activeLocation.dir, proxyConfig)
      : '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-6xl max-h-[92vh] flex flex-col bg-[#0E131D] border border-[#253147] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Loading / Error State */}
        {isLoading && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-slate-300 gap-3">
            <Loader2 className="w-8 h-8 text-sky-400 animate-spin" />
            <p className="text-sm font-mono">
              Чтение метаданных папки и опрос файловых серверов Archive.org...
            </p>
          </div>
        )}

        {!isLoading && error && (
          <div className="p-8 text-center">
            <p className="text-rose-400 font-medium mb-4">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm text-white"
            >
              Закрыть
            </button>
          </div>
        )}

        {!isLoading && !error && detail && activeLocation && (
          <>
            {/* Top Header */}
            <div className="px-5 py-4 bg-[#121826] border-b border-[#222D42]">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-500/15 border border-sky-500/30 text-xs font-mono text-sky-300">
                      <FolderOpen className="w-3.5 h-3.5" />
                      {detail.identifier}
                    </span>
                    {detail.isNsfwDetected && (
                      <span className="px-2 py-0.5 rounded bg-rose-600/90 text-[11px] font-bold text-white">
                        18+ NSFW
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 text-xs text-amber-300 font-mono">
                      <Eye className="w-3.5 h-3.5" />
                      {formatNumber(detail.views?.all_time || 0)} просм.
                      {detail.views?.last_30day
                        ? ` (30д: ${formatNumber(detail.views.last_30day)})`
                        : ''}
                    </span>
                    <span className="text-xs text-slate-400 font-mono">
                      • Выложено: {formatDate(detail.publicdate || detail.addeddate)}
                    </span>
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-300 font-mono">
                      <HardDrive className="w-3.5 h-3.5" />
                      {formatBytes(detail.itemSize)}
                    </span>
                  </div>

                  <h2 className="mt-1.5 text-lg font-bold text-white leading-snug">
                    {detail.title}
                  </h2>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <a
                    href={`https://archive.org/details/${encodeURIComponent(detail.identifier)}`}
                    target="_blank"
                    rel="noreferrer"
                    title="Открыть страницу описания на archive.org"
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#192234] hover:bg-[#222E46] border border-[#2C3A56] text-xs text-slate-200"
                  >
                    Archive.org
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-lg bg-[#192234] hover:bg-rose-500/20 hover:text-rose-300 border border-[#2C3A56] text-slate-300"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Clean, HTML-sanitized, complete expandable folder description */}
              {detail.description && (
                <SafeDescription rawDescription={detail.description} />
              )}
            </div>

            {/* File Server Domains & Local Proxy URL Bar */}
            <div className="px-5 py-3 bg-[#0B0F18] border-b border-[#1E283B] space-y-2.5">
              {/* Mirror selector + Link Mode switch */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-400 mr-1 flex items-center gap-1">
                    <Server className="w-3.5 h-3.5 text-sky-400" />
                    Файловые ноды папки ({detail.node.locations.length}):
                  </span>
                  {detail.node.locations.map((loc, idx) => (
                    <button
                      key={`${loc.server}-${loc.dir}`}
                      type="button"
                      onClick={() => setSelectedMirrorIdx(idx)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono border transition-colors ${
                        idx === selectedMirrorIdx
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200 font-semibold'
                          : 'bg-[#141B29] hover:bg-[#1B2437] border-[#26334B] text-slate-300'
                      }`}
                    >
                      <span>{loc.server}</span>
                      <span className="px-1 py-0.2 rounded bg-black/40 text-[10px] text-slate-400 uppercase">
                        {loc.region} • {loc.role}
                      </span>
                    </button>
                  ))}
                </div>

                {/* Toggle Direct vs Proxy Server Links */}
                <div className="flex items-center gap-1.5 bg-[#131A28] p-1 rounded-lg border border-[#25324A]">
                  <button
                    type="button"
                    onClick={() => onToggleProxyMode(false)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      !proxyConfig.useProxyUrls
                        ? 'bg-sky-500 text-[#04111D] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Прямой сервер IA
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleProxyMode(true)}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                      proxyConfig.useProxyUrls
                        ? 'bg-emerald-500 text-[#03140C] font-semibold'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Прокси-репозиторий
                  </button>
                </div>
              </div>

              {/* Dual Folder URLs Readout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 text-xs">
                {/* Direct Node Directory URL */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#121824] border border-[#222E44]">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-sky-400 shrink-0">
                    Нода IA:
                  </span>
                  <code className="font-mono text-slate-200 truncate flex-1">
                    {directFolderUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => triggerCopy('direct-dir', directFolderUrl)}
                    title="Скопировать прямую ссылку на директорию сервера"
                    className="p-1 rounded hover:bg-slate-700/60 text-slate-300 hover:text-white shrink-0"
                  >
                    {copiedKey === 'direct-dir' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <a
                    href={directFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Открыть индекс папки на файловом сервере Archive.org"
                    className="p-1 rounded hover:bg-slate-700/60 text-slate-300 hover:text-white shrink-0"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>

                {/* Raw Proxy Directory URL */}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#101A1B] border border-emerald-500/25">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 shrink-0">
                    Прокси ({getProxyRepoNameForDomain(activeLocation.server, proxyConfig)}):
                  </span>
                  <code className="font-mono text-emerald-200/95 truncate flex-1">
                    {proxyFolderUrl}
                  </code>
                  <button
                    type="button"
                    onClick={() => triggerCopy('proxy-dir', proxyFolderUrl)}
                    title="Скопировать ссылку через локальный прокси-репозиторий"
                    className="p-1 rounded hover:bg-emerald-900/50 text-emerald-300 hover:text-white shrink-0"
                  >
                    {copiedKey === 'proxy-dir' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={onOpenProxyModal}
                    className="text-[11px] px-1.5 py-0.5 rounded bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 shrink-0"
                  >
                    Настроить
                  </button>
                </div>
              </div>
            </div>

            {/* Inline Video Player Preview (if opened) */}
            {previewFile && (
              <div className="px-5 py-3 bg-[#080B10] border-b border-[#222D42]">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Film className="w-4 h-4 text-sky-400 shrink-0" />
                    <span className="text-xs font-mono text-slate-200 truncate">
                      Предпросмотр: {previewFile.name}
                    </span>
                    {(() => {
                      const mp4Alt = findDerivativeMp4(previewFile);
                      if (!mp4Alt) return null;
                      return (
                        <button
                          type="button"
                          onClick={() => setPreviewFile(mp4Alt)}
                          className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-[11px] text-amber-200 shrink-0"
                        >
                          Если MKV/x265 без видео — открыть H.264 MP4 копию
                        </button>
                      );
                    })()}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPreviewFile(null)}
                    className="text-xs text-slate-400 hover:text-white px-2 py-0.5 rounded bg-slate-800"
                  >
                    Закрыть плеер
                  </button>
                </div>
                <video
                  key={previewFile.name}
                  controls
                  autoPlay
                  preload="metadata"
                  src={buildDirectFileUrl(
                    activeLocation.server,
                    activeLocation.dir,
                    previewFile.name
                  )}
                  className="w-full max-h-72 rounded-lg bg-black border border-slate-800"
                />
              </div>
            )}

            {/* Tabs & Bulk Action Toolbar */}
            <div className="px-5 py-2.5 bg-[#121826] border-b border-[#202A3E] flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
              {/* Category Tabs */}
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('originals')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'originals'
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#192234]'
                  }`}
                >
                  Оригиналы видео ({counts.originals})
                </button>
                {counts.derivatives > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('derivatives')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'derivatives'
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#192234]'
                    }`}
                  >
                    Производные MP4 ({counts.derivatives})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('all-video')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'all-video'
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#192234]'
                  }`}
                >
                  Все видео ({counts.allVideo})
                </button>
                {counts.extras > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('extras')}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                      activeTab === 'extras'
                        ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                        : 'text-slate-400 hover:text-slate-200 hover:bg-[#192234]'
                    }`}
                  >
                    Субтитры / Аудио / Торрент ({counts.extras})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    activeTab === 'all'
                      ? 'bg-sky-500/20 text-sky-200 border border-sky-500/40'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#192234]'
                  }`}
                >
                  Все файлы ({counts.all})
                </button>
              </div>

              {/* Filter & Batch Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    placeholder="Фильтр серий (1x01, mkv...)"
                    className="pl-8 pr-3 py-1.5 w-48 rounded-lg bg-[#0B0E14] border border-[#27334B] text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                  />
                </div>

                <button
                  type="button"
                  disabled={selectedFileEntries.length === 0}
                  onClick={handleCopySelectedUrls}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A2438] hover:bg-[#23304A] disabled:opacity-40 border border-[#2D3C59] text-xs font-medium text-slate-100"
                >
                  {copiedKey === 'bulk-urls' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Скопировано ({selectedFileEntries.length})
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                      Копировать URL ({selectedFileEntries.length})
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={selectedFileEntries.length === 0}
                  onClick={handleAddSelectedToQueue}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-xs font-semibold text-[#04150D] transition-colors"
                >
                  {copiedKey === 'added-queue' ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      Добавлено в корзину!
                    </>
                  ) : (
                    <>
                      <Plus className="w-3.5 h-3.5" />
                      В корзину ({selectedFileEntries.length} • {formatBytes(selectedTotalBytes)})
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* File List Table */}
            <div className="flex-1 overflow-y-auto divide-y divide-[#1A2232]">
              {/* Sticky Select-All Subheader */}
              <div className="sticky top-0 z-10 flex items-center gap-3 px-5 py-2 bg-[#0F141F]/95 backdrop-blur border-b border-[#1E283B] text-[11px] font-medium text-slate-400">
                <button
                  type="button"
                  onClick={toggleSelectAllVisible}
                  className="inline-flex items-center gap-1.5 text-slate-300 hover:text-white"
                >
                  {allVisibleSelected ? (
                    <CheckSquare className="w-4 h-4 text-sky-400" />
                  ) : (
                    <Square className="w-4 h-4 text-slate-500" />
                  )}
                  Выбрать все ({visibleFiles.length})
                </button>
                <span className="ml-auto hidden sm:inline">
                  Активный режим ссылок:{' '}
                  <strong
                    className={
                      proxyConfig.useProxyUrls ? 'text-emerald-300' : 'text-sky-300'
                    }
                  >
                    {proxyConfig.useProxyUrls
                      ? `Прокси-репозиторий (${getProxyRepoNameForDomain(activeLocation.server, proxyConfig)})`
                      : `Прямая нода (${activeLocation.server})`}
                  </strong>
                </span>
              </div>

              {visibleFiles.length === 0 ? (
                <div className="py-16 text-center text-sm text-slate-400">
                  В этой категории нет файлов, подходящих под фильтр.
                </div>
              ) : (
                visibleFiles.map((file, idx) => {
                  const isChecked = selectedNames.has(file.name);
                  const queueKey = `${detail.identifier}::${file.name}`;
                  const isInQueue = queuedKeys.has(queueKey);
                  const activeUrl = buildActiveFileUrl(
                    activeLocation.server,
                    activeLocation.dir,
                    file.name,
                    proxyConfig
                  );
                  const isVideo =
                    file.category === 'video-original' ||
                    file.category === 'video-derivative';

                  return (
                    <div
                      key={file.name}
                      className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 px-5 py-2.5 hover:bg-[#141C2B] transition-colors ${
                        isInQueue ? 'bg-emerald-950/15' : ''
                      }`}
                    >
                      {/* Checkbox + Index + Filename */}
                      <div className="flex items-start sm:items-center gap-2.5 min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => toggleSelectFile(file.name)}
                          className="mt-0.5 sm:mt-0 text-slate-400 hover:text-sky-300 shrink-0"
                        >
                          {isChecked ? (
                            <CheckSquare className="w-4 h-4 text-sky-400" />
                          ) : (
                            <Square className="w-4 h-4 text-slate-600" />
                          )}
                        </button>

                        <span className="w-7 text-[11px] font-mono text-slate-500 text-right shrink-0 tabular-nums">
                          {String(idx + 1).padStart(2, '0')}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div
                            title={file.name}
                            className="text-xs sm:text-[13px] font-mono text-slate-100 break-all sm:break-normal sm:truncate"
                          >
                            {file.name}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] text-slate-400 font-mono">
                            <span
                              className={`px-1.5 py-0.2 rounded text-[10px] font-semibold ${
                                file.source === 'original'
                                  ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
                                  : 'bg-slate-800 text-slate-300'
                              }`}
                            >
                              {file.format}
                            </span>
                            {file.width && file.height && (
                              <span className="text-sky-300/90">
                                {file.width}×{file.height}
                              </span>
                            )}
                            {file.lengthSeconds && (
                              <span>⏱ {formatDuration(file.lengthSeconds)}</span>
                            )}
                            <span className="text-slate-300 font-semibold">
                              {formatBytes(file.sizeBytes)}
                            </span>
                            {file.md5 && (
                              <span className="hidden xl:inline text-slate-500">
                                md5: {file.md5.slice(0, 10)}…
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* File Action Buttons */}
                      <div className="flex items-center justify-end gap-1.5 shrink-0 pl-8 sm:pl-0">
                        {isVideo && (
                          <button
                            type="button"
                            onClick={() => setPreviewFile(file)}
                            title="Предпросмотр видео в плеере"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1A2335] hover:bg-[#24314A] border border-[#2B3955] text-[11px] text-slate-200"
                          >
                            <Play className="w-3 h-3 text-sky-400" />
                            <span className="hidden md:inline">Плеер</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => triggerCopy(`file-${file.name}`, activeUrl)}
                          title={`Копировать ссылку (${proxyConfig.useProxyUrls ? 'прокси-репозиторий' : activeLocation.server})`}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1A2335] hover:bg-[#24314A] border border-[#2B3955] text-[11px] font-mono text-slate-200"
                        >
                          {copiedKey === `file-${file.name}` ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>OK</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3 text-slate-300" />
                              <span>URL</span>
                            </>
                          )}
                        </button>

                        {isInQueue ? (
                          <button
                            type="button"
                            onClick={() => onRemoveFileKeysFromQueue([queueKey])}
                            title="Убрать из корзины скачивания"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-emerald-500/20 hover:bg-rose-500/20 border border-emerald-500/40 hover:border-rose-500/40 text-[11px] text-emerald-300 hover:text-rose-300"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span className="hidden md:inline">В корзине</span>
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => onAddFilesToQueue([toQueuedItem(file)])}
                            title="Добавить файл в корзину скачивания"
                            className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#1A2335] hover:bg-emerald-500/20 border border-[#2B3955] hover:border-emerald-500/40 text-[11px] text-slate-200 hover:text-emerald-200"
                          >
                            <Plus className="w-3 h-3 text-emerald-400" />
                            <span className="hidden md:inline">В корзину</span>
                          </button>
                        )}

                        <a
                          href={activeUrl}
                          target="_blank"
                          rel="noreferrer"
                          title={`Скачать файл (${activeUrl})`}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-[11px] font-medium text-sky-200"
                        >
                          <Download className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
