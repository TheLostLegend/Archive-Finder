import React, { useState } from 'react';
import {
  Calendar,
  Check,
  Copy,
  Eye,
  FolderOpen,
  HardDrive,
  Layers,
  Server,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  ArchiveSearchItem,
  LayoutViewMode,
  NodeResolution,
  ProxyMirrorConfig,
} from '../types/archive';
import {
  formatBytes,
  formatCompactNumber,
  formatDate,
  formatNumber,
} from '../utils/formatters';
import { buildActiveFolderUrl } from '../utils/proxyMirror';

interface FolderCardProps {
  item: ArchiveSearchItem;
  node?: NodeResolution;
  viewMode: LayoutViewMode;
  proxyConfig: ProxyMirrorConfig;
  blurNsfwThumbs: boolean;
  queuedCountForFolder: number;
  isResolvingNode?: boolean;
  onOpenFolder: (identifier: string) => void;
  onResolveNode: (identifier: string, filesCount: number) => void;
}

const VIDEO_FORMAT_LABELS: Record<string, string> = {
  Matroska: 'MKV',
  MPEG4: 'MP4',
  'h.264': 'H.264',
  WebM: 'WEBM',
  AVI: 'AVI',
  QuickTime: 'MOV',
  SubRip: 'SRT',
};

export const FolderCard: React.FC<FolderCardProps> = ({
  item,
  node,
  viewMode,
  proxyConfig,
  blurNsfwThumbs,
  queuedCountForFolder,
  isResolvingNode,
  onOpenFolder,
  onResolveNode,
}) => {
  const [imgError, setImgError] = useState(false);
  const [copiedFolderUrl, setCopiedFolderUrl] = useState(false);
  const [unblurred, setUnblurred] = useState(false);

  const shouldBlur = item.isNsfwDetected && blurNsfwThumbs && !unblurred;

  const badgeFormats = Array.from(
    new Set(item.formats.map((f) => VIDEO_FORMAT_LABELS[f]).filter(Boolean))
  ).slice(0, 4);

  const activeFolderUrl = node
    ? buildActiveFolderUrl(node.primaryServer, node.dir, proxyConfig)
    : '';

  const handleCopyFolderLink = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!activeFolderUrl) return;
    navigator.clipboard.writeText(activeFolderUrl);
    setCopiedFolderUrl(true);
    setTimeout(() => setCopiedFolderUrl(false), 1800);
  };

  const handleResolveClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onResolveNode(item.identifier, item.filesCount);
  };

  if (viewMode === 'table') {
    return (
      <div
        onClick={() => onOpenFolder(item.identifier)}
        className="group flex flex-col sm:flex-row sm:items-center gap-3 px-3.5 py-2.5 bg-[#111620] hover:bg-[#161D2B] border border-[#222C3E] hover:border-sky-500/40 rounded-lg cursor-pointer transition-colors"
      >
        {/* Thumbnail mini */}
        <div className="relative w-16 h-11 shrink-0 rounded overflow-hidden bg-[#0B0E14] border border-[#222C3E] flex items-center justify-center">
          {!imgError ? (
            <img
              src={`https://archive.org/services/img/${encodeURIComponent(item.identifier)}`}
              alt={item.title}
              loading="lazy"
              onError={() => setImgError(true)}
              className={`w-full h-full object-cover transition-all ${
                shouldBlur ? 'blur-md scale-110' : ''
              }`}
            />
          ) : (
            <FolderOpen className="w-5 h-5 text-slate-600" />
          )}
          {item.isNsfwDetected && (
            <span className="absolute top-0.5 right-0.5 px-1 py-0.2 bg-rose-600/90 text-[9px] font-bold text-white rounded">
              18+
            </span>
          )}
        </div>

        {/* Title & ID */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-slate-100 group-hover:text-sky-300 truncate">
              {item.title}
            </h3>
            {queuedCountForFolder > 0 && (
              <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 rounded">
                В корзине: {queuedCountForFolder}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-0.5 text-xs text-slate-400">
            <span className="font-mono text-slate-400 truncate max-w-[220px]">
              /{item.identifier}/
            </span>
            {badgeFormats.map((fmt) => (
              <span
                key={fmt}
                className="px-1.5 py-0.2 text-[10px] font-mono bg-slate-800/90 text-slate-300 rounded border border-slate-700/70"
              >
                {fmt}
              </span>
            ))}
          </div>
        </div>

        {/* Server Node Column */}
        <div className="sm:w-56 shrink-0 flex items-center gap-1.5">
          {node ? (
            <div className="flex items-center gap-1 min-w-0 w-full">
              <span
                title={`Сервер: ${node.primaryServer}${node.dir}/`}
                className="inline-flex items-center gap-1.5 px-2 py-1 rounded bg-sky-500/10 border border-sky-500/25 text-[11px] font-mono text-sky-300 truncate"
              >
                <Server className="w-3 h-3 shrink-0 text-sky-400" />
                <span className="truncate">{node.primaryServer}</span>
              </span>
              {node.locations.length > 1 && (
                <span
                  title={node.locations.map((l) => l.server).join(', ')}
                  className="px-1.5 py-0.5 rounded bg-slate-800 text-[10px] font-mono text-slate-300 shrink-0"
                >
                  +{node.locations.length - 1}
                </span>
              )}
              <button
                type="button"
                onClick={handleCopyFolderLink}
                title="Копировать URL папки"
                className="p-1.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white shrink-0"
              >
                {copiedFolderUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResolveClick}
              disabled={isResolvingNode}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#182030] hover:bg-[#202B40] border border-[#29354B] text-[11px] font-mono text-slate-300 transition-colors"
            >
              <Server className="w-3 h-3 text-slate-400" />
              {isResolvingNode ? 'Запрос ноды...' : 'Узнать домен'}
            </button>
          )}
        </div>

        {/* Metrics */}
        <div className="flex items-center justify-between sm:justify-end gap-4 text-xs tabular-nums shrink-0">
          <div className="w-24 text-right" title="Файлов и общий размер папки">
            <div className="text-slate-200 font-medium">
              {node?.originalVideoCount
                ? `${node.originalVideoCount} видео`
                : `${item.filesCount} файл.`}
            </div>
            <div className="text-[11px] text-slate-400 font-mono">
              {formatBytes(item.itemSize)}
            </div>
          </div>

          <div
            className="w-24 text-right"
            title={`Всего просмотров: ${formatNumber(item.downloads)} | За 30 дн.: ${formatNumber(item.month)}`}
          >
            <div className="inline-flex items-center gap-1 text-amber-300/95 font-medium">
              <Eye className="w-3.5 h-3.5" />
              {formatCompactNumber(item.downloads)}
            </div>
            <div className="text-[11px] text-slate-400">
              30д: {formatCompactNumber(item.month)}
            </div>
          </div>

          <div className="w-24 text-right text-slate-300 font-mono text-[11px]">
            {formatDate(item.publicdate || item.addeddate)}
          </div>
        </div>
      </div>
    );
  }

  // GRID CARD MODE (scales dynamically across columns per row based on page zoom/scale)
  return (
    <div
      onClick={() => onOpenFolder(item.identifier)}
      className="group flex flex-col bg-[#111620] hover:bg-[#151C28] border border-[#222C3E] hover:border-sky-500/45 rounded-xl overflow-hidden cursor-pointer transition-all duration-150 shadow-sm hover:shadow-sky-950/30"
    >
      {/* Cover Header */}
      <div className="relative h-32 w-full bg-[#0A0D13] border-b border-[#1D2636] overflow-hidden">
        {!imgError ? (
          <img
            src={`https://archive.org/services/img/${encodeURIComponent(item.identifier)}`}
            alt={item.title}
            loading="lazy"
            onError={() => setImgError(true)}
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${
              shouldBlur ? 'blur-xl scale-110 opacity-60' : 'opacity-90'
            }`}
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-[#0F1522] to-[#0A0D13] text-slate-600">
            <FolderOpen className="w-8 h-8 mb-1 text-slate-600" />
            <span className="text-[10px] font-mono text-slate-500 px-2 truncate max-w-full">
              {item.identifier}
            </span>
          </div>
        )}

        {/* Gradient vignette */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-[#0B0E14]/25 to-transparent pointer-events-none" />

        {/* Top badges */}
        <div className="absolute top-2 left-2 right-2 flex items-start justify-between gap-1.5">
          <div className="flex flex-wrap gap-1">
            {badgeFormats.map((fmt) => (
              <span
                key={fmt}
                className="px-1.5 py-0.5 rounded bg-[#0B0E14]/85 backdrop-blur-sm border border-slate-700/80 text-[10px] font-mono font-semibold text-sky-300"
              >
                {fmt}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-1">
            {queuedCountForFolder > 0 && (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/90 text-[#04130D] text-[10px] font-bold">
                +{queuedCountForFolder}
              </span>
            )}
            {item.isNsfwDetected && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setUnblurred((prev) => !prev);
                }}
                title="Контент 18+ / NSFW (нажмите, чтобы показать/скрыть превью)"
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-rose-600/90 hover:bg-rose-500 text-white text-[10px] font-bold shadow"
              >
                <ShieldAlert className="w-2.5 h-2.5" />
                18+
              </button>
            )}
          </div>
        </div>

        {/* Bottom overlay metrics on cover */}
        <div className="absolute bottom-1.5 left-2 right-2 flex items-center justify-between text-[11px] font-mono">
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0B0E14]/85 text-slate-200 border border-slate-800">
            <Layers className="w-3 h-3 text-sky-400" />
            {node?.originalVideoCount
              ? `${node.originalVideoCount} видео`
              : `${item.filesCount} файл.`}
          </span>

          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#0B0E14]/85 text-slate-200 border border-slate-800">
            <HardDrive className="w-3 h-3 text-emerald-400" />
            {formatBytes(item.itemSize)}
          </span>
        </div>
      </div>

      {/* Card Body */}
      <div className="flex-1 flex flex-col p-3 gap-2">
        <div>
          <h3
            title={item.title}
            className="text-[13px] font-semibold leading-snug text-slate-100 group-hover:text-sky-300 line-clamp-2 min-h-[2.25rem]"
          >
            {item.title}
          </h3>
          <div
            title={`/items/${item.identifier}/`}
            className="mt-0.5 text-[11px] font-mono text-slate-400 truncate"
          >
            id: {item.identifier}
          </div>
        </div>

        {/* File Server Node Pill */}
        <div className="mt-auto pt-1">
          {node ? (
            <div className="flex items-center gap-1">
              <div
                title={`Прямой сервер папки: https://${node.primaryServer}${node.dir}/`}
                className="flex-1 min-w-0 flex items-center gap-1.5 px-2 py-1 rounded-md bg-sky-500/10 border border-sky-500/25 text-[11px] font-mono text-sky-300"
              >
                <Server className="w-3 h-3 shrink-0 text-sky-400" />
                <span className="truncate">{node.primaryServer}</span>
                {node.locations.length > 1 && (
                  <span className="ml-auto text-[10px] px-1 rounded bg-sky-500/20 text-sky-200 shrink-0">
                    +{node.locations.length - 1}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleCopyFolderLink}
                title={
                  proxyConfig.useProxyUrls
                    ? 'Копировать ссылку на папку через прокси-репозиторий'
                    : 'Копировать прямую ссылку на папку файлового сервера'
                }
                className="p-1.5 rounded-md bg-[#192233] hover:bg-[#243047] border border-[#2A3750] text-slate-300 hover:text-white shrink-0 transition-colors"
              >
                {copiedFolderUrl ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={handleResolveClick}
              disabled={isResolvingNode}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1 rounded-md bg-[#161E2E] hover:bg-[#1E293E] border border-[#263248] text-[11px] font-mono text-slate-300 hover:text-sky-300 transition-colors"
            >
              <Sparkles className="w-3 h-3 text-sky-400" />
              {isResolvingNode ? 'Определение ноды...' : 'Определить файловый домен'}
            </button>
          )}
        </div>

        {/* Footer Stats: Views & Upload Date */}
        <div className="pt-2 border-t border-[#1C2434] flex items-center justify-between text-[11px] text-slate-400 tabular-nums">
          <span
            title={`Просмотры папки: ${formatNumber(item.downloads)} (за 30 дней: ${formatNumber(item.month)}, за 7 дней: ${formatNumber(item.week)})`}
            className="inline-flex items-center gap-1 text-amber-300/90 font-medium"
          >
            <Eye className="w-3.5 h-3.5" />
            {formatNumber(item.downloads)}
          </span>

          <span
            title={`Дата публикации: ${item.publicdate || item.addeddate || '—'}`}
            className="inline-flex items-center gap-1 font-mono text-slate-400"
          >
            <Calendar className="w-3 h-3 text-slate-500" />
            {formatDate(item.publicdate || item.addeddate)}
          </span>
        </div>
      </div>
    </div>
  );
};
