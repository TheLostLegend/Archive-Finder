import React, { useEffect, useMemo, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  Globe,
  HelpCircle,
  Loader2,
  Plus,
  Radar,
  Server,
  Settings2,
  ShoppingCart,
  Square,
  Trash2,
  X,
} from 'lucide-react';
import {
  DiscoveredDomain,
  NodeResolution,
  ProxyMirrorConfig,
  ProxyRepoNaming,
  QueuedDownloadFile,
} from '../types/archive';
import { harvestPopularVideoDomains } from '../services/archiveApi';
import { formatBytes } from '../utils/formatters';
import {
  ExportScriptFormat,
  buildActiveFileUrl,
  buildProxyFileUrl,
  generateBatchDownloadOutput,
  generateProxyProvisioningBash,
  generateProxyProvisioningPowerShell,
  getProxyRepoNameForDomain,
} from '../utils/proxyMirror';

export type ProxyModalTab = 'domains' | 'proxy-config' | 'queue';

interface ProxyWorkspaceModalProps {
  isOpen: boolean;
  initialTab: ProxyModalTab;
  discoveredDomains: DiscoveredDomain[];
  queuedFiles: QueuedDownloadFile[];
  proxyConfig: ProxyMirrorConfig;
  onClose: () => void;
  onUpdateProxyConfig: (patch: Partial<ProxyMirrorConfig>) => void;
  onAddManualDomain: (rawDomainOrUrl: string) => void;
  onRemoveDomain: (domain: string) => void;
  onClearDomains: () => void;
  onRemoveQueueKey: (key: string) => void;
  onClearQueue: () => void;
  onOpenFolderById: (identifier: string) => void;
  onRegisterNode: (node: NodeResolution) => void;
}

export const ProxyWorkspaceModal: React.FC<ProxyWorkspaceModalProps> = ({
  isOpen,
  initialTab,
  discoveredDomains,
  queuedFiles,
  proxyConfig,
  onClose,
  onUpdateProxyConfig,
  onAddManualDomain,
  onRemoveDomain,
  onClearDomains,
  onRemoveQueueKey,
  onClearQueue,
  onOpenFolderById,
  onRegisterNode,
}) => {
  const [tab, setTab] = useState<ProxyModalTab>(initialTab);
  const [onlyQueueDomains, setOnlyQueueDomains] = useState(false);
  const [manualDomainInput, setManualDomainInput] = useState('');
  const [provisionLang, setProvisionLang] = useState<'bash' | 'powershell'>('bash');
  const [exportFormat, setExportFormat] = useState<ExportScriptFormat>('aria2c');
  const [exportViaProxy, setExportViaProxy] = useState<boolean>(
    proxyConfig.useProxyUrls
  );
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isHarvesting, setIsHarvesting] = useState(false);
  const [harvestProg, setHarvestProg] = useState<{ done: number; total: number } | null>(
    null
  );
  const harvestAbortRef = React.useRef<AbortController | null>(null);

  const handleToggleHarvestPool = () => {
    if (isHarvesting) {
      harvestAbortRef.current?.abort();
      setIsHarvesting(false);
      setHarvestProg(null);
      return;
    }
    const ctrl = new AbortController();
    harvestAbortRef.current = ctrl;
    setIsHarvesting(true);
    setHarvestProg({ done: 0, total: 60 });

    harvestPopularVideoDomains(
      60,
      (node) => onRegisterNode(node),
      (done, total) => setHarvestProg({ done, total }),
      ctrl.signal
    ).finally(() => {
      if (!ctrl.signal.aborted) {
        setIsHarvesting(false);
        setHarvestProg(null);
      }
    });
  };

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setExportViaProxy(proxyConfig.useProxyUrls);
    }
  }, [isOpen, initialTab]);

  useEffect(() => {
    setExportViaProxy(proxyConfig.useProxyUrls);
  }, [proxyConfig.useProxyUrls]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  const queueDomainSet = useMemo(() => {
    return new Set(queuedFiles.map((f) => f.server.toLowerCase()));
  }, [queuedFiles]);

  const filteredDomains = useMemo(() => {
    if (!onlyQueueDomains) return discoveredDomains;
    return discoveredDomains.filter((d) =>
      queueDomainSet.has(d.domain.toLowerCase())
    );
  }, [discoveredDomains, onlyQueueDomains, queueDomainSet]);

  const activeDomainNames = useMemo(
    () => filteredDomains.map((d) => d.domain),
    [filteredDomains]
  );

  const totalQueueBytes = useMemo(
    () => queuedFiles.reduce((acc, f) => acc + f.sizeBytes, 0),
    [queuedFiles]
  );

  const provisionScript = useMemo(() => {
    const targetDomains =
      activeDomainNames.length > 0 ? activeDomainNames : ['dn801206.us.archive.org'];
    return provisionLang === 'bash'
      ? generateProxyProvisioningBash(targetDomains, proxyConfig)
      : generateProxyProvisioningPowerShell(targetDomains, proxyConfig);
  }, [activeDomainNames, proxyConfig, provisionLang]);

  const batchDownloadScript = useMemo(() => {
    return generateBatchDownloadOutput(
      queuedFiles,
      proxyConfig,
      exportFormat,
      exportViaProxy
    );
  }, [queuedFiles, proxyConfig, exportFormat, exportViaProxy]);

  if (!isOpen) return null;

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId((prev) => (prev === id ? null : prev)), 1800);
  };

  const downloadTextFile = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualDomainInput.trim()) return;
    onAddManualDomain(manualDomainInput.trim());
    setManualDomainInput('');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-5xl max-h-[92vh] flex flex-col bg-[#0E131D] border border-[#253147] rounded-2xl shadow-2xl overflow-hidden"
      >
        {/* Modal Header */}
        <div className="px-5 py-4 bg-[#121826] border-b border-[#222D42] flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-300">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">
                Файловые домены Archive.org, Прокси-репозитории и Корзина загрузки
              </h2>
              <p className="text-xs text-slate-400">
                Сбор прямых файловых серверов (dn/ia.*.archive.org), автонастройка Raw Proxy репозиториев и пакетное скачивание
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg bg-[#192234] hover:bg-rose-500/20 hover:text-rose-300 border border-[#2C3A56] text-slate-300"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 pt-2.5 bg-[#0B0F18] border-b border-[#1E283B] flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab('domains')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-t border-x transition-colors ${
              tab === 'domains'
                ? 'bg-[#0E131D] text-sky-300 border-[#253147]'
                : 'bg-transparent text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            1. Реестр файловых доменов ({discoveredDomains.length})
          </button>

          <button
            type="button"
            onClick={() => setTab('proxy-config')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-t border-x transition-colors ${
              tab === 'proxy-config'
                ? 'bg-[#0E131D] text-emerald-300 border-[#253147]'
                : 'bg-transparent text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <Settings2 className="w-3.5 h-3.5" />
            2. Настройка прокси-репозиториев &amp; API скрипт
          </button>

          <button
            type="button"
            onClick={() => setTab('queue')}
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-t-lg text-xs font-semibold border-t border-x transition-colors ${
              tab === 'queue'
                ? 'bg-[#0E131D] text-amber-300 border-[#253147]'
                : 'bg-transparent text-slate-400 hover:text-slate-200 border-transparent'
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            3. Корзина файлов ({queuedFiles.length}
            {totalQueueBytes > 0 ? ` • ${formatBytes(totalQueueBytes)}` : ''})
          </button>
        </div>

        {/* TAB 1: DISCOVERED DOMAINS */}
        {tab === 'domains' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Explanation Callout + 1-Click Broad Pool Harvester */}
            <div className="p-3.5 rounded-xl bg-sky-500/10 border border-sky-500/25 text-xs text-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="space-y-1">
                <div className="font-semibold text-sky-300 flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 shrink-0" />
                  Зачем нужны прямые файловые домены нод (dn* / ia*.archive.org)?
                </div>
                <p className="text-slate-300 leading-relaxed">
                  Ссылки <code className="text-sky-200">archive.org/download/...</code> делают{' '}
                  <strong>HTTP 302 Redirect</strong> на конкретный файловый сервер (например,{' '}
                  <code className="text-sky-200">dn801206.us.archive.org</code> или{' '}
                  <code className="text-sky-200">dn720303.ca.archive.org</code>). Для кэширующих{' '}
                  <strong>Raw (proxy)</strong> репозиториев нужны именно эти прямые домены нод, отдающие файлы напрямую с кодом <code className="text-emerald-300">200 OK</code>.
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleHarvestPool}
                className={`shrink-0 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-semibold border transition-colors ${
                  isHarvesting
                    ? 'bg-amber-500/20 border-amber-400/50 text-amber-200'
                    : 'bg-sky-500 hover:bg-sky-400 border-sky-400 text-[#04111D]'
                }`}
              >
                {isHarvesting ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Сбор пула ({harvestProg?.done ?? 0}/{harvestProg?.total ?? 60}) • Стоп
                    <Square className="w-3 h-3 fill-current" />
                  </>
                ) : (
                  <>
                    <Radar className="w-4 h-4" />
                    Авто-сбор пула доменов IA (60 папок)
                  </>
                )}
              </button>
            </div>

            {/* Domain Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <form onSubmit={handleManualSubmit} className="flex items-center gap-2 flex-1">
                <input
                  type="text"
                  value={manualDomainInput}
                  onChange={(e) => setManualDomainInput(e.target.value)}
                  placeholder="Добавить домен или URL (напр. dn801206.us.archive.org)"
                  className="flex-1 max-w-md px-3 py-1.5 rounded-lg bg-[#090C12] border border-[#263249] text-xs font-mono text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-sky-500"
                />
                <button
                  type="button"
                  onClick={handleManualSubmit}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-xs font-medium text-sky-200"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Добавить
                </button>
              </form>

              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={onlyQueueDomains}
                    onChange={(e) => setOnlyQueueDomains(e.target.checked)}
                    className="rounded border-slate-600 bg-slate-900 text-sky-500"
                  />
                  Только домены из корзины ({queueDomainSet.size})
                </label>

                <button
                  type="button"
                  disabled={filteredDomains.length === 0}
                  onClick={() =>
                    copyText(
                      'domains-https',
                      filteredDomains.map((d) => `https://${d.domain}`).join('\n')
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#182132] hover:bg-[#212D44] disabled:opacity-40 border border-[#2B3955] text-xs text-slate-200"
                >
                  {copiedId === 'domains-https' ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                      Скопировано!
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-sky-400" />
                      Копировать Remote URLs
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={filteredDomains.length === 0}
                  onClick={() =>
                    downloadTextFile(
                      'archive_org_storage_domains.txt',
                      filteredDomains.map((d) => `https://${d.domain}`).join('\n')
                    )
                  }
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#182132] hover:bg-[#212D44] disabled:opacity-40 border border-[#2B3955] text-xs text-slate-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  .txt
                </button>
              </div>
            </div>

            {/* Domain Table */}
            <div className="border border-[#222D42] rounded-xl overflow-hidden">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#131A28] text-slate-400 border-b border-[#222D42]">
                  <tr>
                    <th className="py-2.5 px-3.5 font-medium">
                      Файловый домен (Remote Storage)
                    </th>
                    <th className="py-2.5 px-3 font-medium">Тип / Регион</th>
                    <th className="py-2.5 px-3 font-medium">Имя прокси-репозитория</th>
                    <th className="py-2.5 px-3 font-medium">Папки</th>
                    <th className="py-2.5 px-3 text-right font-medium">Действия</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#1A2233] bg-[#0C1018]">
                  {filteredDomains.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-slate-400">
                        Пока нет выбранных доменов. Нажмите «Собрать все домены страницы» в панели результатов или откройте любую папку.
                      </td>
                    </tr>
                  ) : (
                    filteredDomains.map((d) => {
                      const repoName = getProxyRepoNameForDomain(d.domain, proxyConfig);
                      const inQueue = queueDomainSet.has(d.domain.toLowerCase());
                      return (
                        <tr key={d.domain} className="hover:bg-[#131A28]/70">
                          <td className="py-2.5 px-3.5 font-mono text-sky-300 font-medium">
                            <div className="flex items-center gap-2">
                              <Server className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                              <span>https://{d.domain}</span>
                              {inQueue && (
                                <span className="px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-sans font-semibold">
                                  В корзине
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-300">
                            <span className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] uppercase">
                              {d.nodeType.toUpperCase()} • {d.region}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-emerald-300">
                            {repoName}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="flex flex-wrap gap-1 max-w-xs">
                              {d.folderIds.slice(0, 3).map((fid) => (
                                <button
                                  key={fid}
                                  type="button"
                                  onClick={() => {
                                    onClose();
                                    onOpenFolderById(fid);
                                  }}
                                  className="px-1.5 py-0.5 rounded bg-[#182132] hover:bg-sky-500/20 text-[11px] font-mono text-slate-300 hover:text-sky-200 truncate max-w-[130px]"
                                >
                                  {fid}
                                </button>
                              ))}
                              {d.folderIds.length > 3 && (
                                <span className="text-[11px] text-slate-500 font-mono">
                                  +{d.folderIds.length - 3}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  copyText(`dom-${d.domain}`, `https://${d.domain}`)
                                }
                                title="Скопировать Remote URL"
                                className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                              >
                                {copiedId === `dom-${d.domain}` ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                              <a
                                href={`https://${d.domain}${d.sampleDir || '/'}`}
                                target="_blank"
                                rel="noreferrer"
                                title="Проверить доступность ноды"
                                className="p-1.5 rounded hover:bg-slate-800 text-slate-300"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                              </a>
                              <button
                                type="button"
                                onClick={() => onRemoveDomain(d.domain)}
                                title="Удалить из списка"
                                className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {discoveredDomains.length > 0 && (
              <div className="flex justify-between items-center pt-1">
                <button
                  type="button"
                  onClick={onClearDomains}
                  className="text-xs text-rose-400/80 hover:text-rose-300"
                >
                  Очистить реестр доменов
                </button>
                <button
                  type="button"
                  onClick={() => setTab('proxy-config')}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-semibold text-[#04150D]"
                >
                  Перейти к настройке прокси и API скрипту →
                </button>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: PROXY REPOSITORY CONFIG & REST API PROVISIONING */}
        {tab === 'proxy-config' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {/* Global Switch + Inputs */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-xl bg-[#121826] border border-[#222E44]">
              <div className="md:col-span-2 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[#1E293D]">
                <div>
                  <div className="text-sm font-semibold text-white">
                    Глобальная перезапись ссылок через локальный прокси-сервер
                  </div>
                  <div className="text-xs text-slate-400">
                    Когда включено, все кнопки «Копировать URL» и скачивания в папках сразу выдают адрес вашего прокси-репозитория
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateProxyConfig({ useProxyUrls: !proxyConfig.useProxyUrls })
                  }
                  className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${
                    proxyConfig.useProxyUrls
                      ? 'bg-emerald-500 text-[#03140C]'
                      : 'bg-[#1D273B] text-slate-200 border border-[#30405F]'
                  }`}
                >
                  {proxyConfig.useProxyUrls
                    ? 'ВКЛЮЧЕНО (Ссылки через прокси)'
                    : 'ВЫКЛЮЧЕНО (Прямые ссылки IA)'}
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Базовый URL прокси-репозиториев
                </label>
                <input
                  type="text"
                  value={proxyConfig.proxyBaseUrl}
                  onChange={(e) =>
                    onUpdateProxyConfig({ proxyBaseUrl: e.target.value })
                  }
                  placeholder="http://localhost:8081/repository"
                  className="w-full px-3 py-2 rounded-lg bg-[#090C12] border border-[#28354E] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Схема именования Raw Proxy репозиториев
                </label>
                <select
                  value={proxyConfig.repoNaming}
                  onChange={(e) =>
                    onUpdateProxyConfig({
                      repoNaming: e.target.value as ProxyRepoNaming,
                    })
                  }
                  className="w-full px-3 py-2 rounded-lg bg-[#090C12] border border-[#28354E] text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="ia-short">
                    Префикс + короткая нода: ia-dn801206.us (Рекомендуется)
                  </option>
                  <option value="short-only">Только короткая нода: dn801206.us</option>
                  <option value="ia-full">
                    Полный домен: ia-dn801206.us.archive.org
                  </option>
                  <option value="single-group">
                    Единый Raw (group) репозиторий: {proxyConfig.singleGroupName}
                  </option>
                </select>
              </div>

              {proxyConfig.repoNaming === 'single-group' ? (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Имя Raw Group репозитория
                  </label>
                  <input
                    type="text"
                    value={proxyConfig.singleGroupName}
                    onChange={(e) =>
                      onUpdateProxyConfig({ singleGroupName: e.target.value })
                    }
                    className="w-full px-3 py-2 rounded-lg bg-[#090C12] border border-[#28354E] text-xs font-mono text-slate-100"
                  />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Префикс имени репозитория
                  </label>
                  <input
                    type="text"
                    value={proxyConfig.repoPrefix}
                    onChange={(e) =>
                      onUpdateProxyConfig({ repoPrefix: e.target.value })
                    }
                    placeholder="ia-"
                    className="w-full px-3 py-2 rounded-lg bg-[#090C12] border border-[#28354E] text-xs font-mono text-slate-100"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Имя хранилища (Blob Store)
                </label>
                <input
                  type="text"
                  value={proxyConfig.blobStoreName}
                  onChange={(e) =>
                    onUpdateProxyConfig({ blobStoreName: e.target.value })
                  }
                  placeholder="default"
                  className="w-full px-3 py-2 rounded-lg bg-[#090C12] border border-[#28354E] text-xs font-mono text-slate-100"
                />
              </div>

              {/* Live Transformation Example */}
              <div className="md:col-span-2 p-3 rounded-lg bg-[#090D14] border border-[#1E2A3F] text-xs font-mono space-y-1.5">
                <div className="text-[11px] font-sans text-slate-400">
                  Пример трансформации ссылки (на примере папки Евангелиона):
                </div>
                <div className="text-sky-300 truncate">
                  Прямая: https://dn801206.us.archive.org/0/items/evadubbed/Neon%20Genesis%20Evangelion%20-%201x01.mkv
                </div>
                <div className="text-emerald-300 truncate">
                  Прокси:{' '}
                  {buildProxyFileUrl(
                    'dn801206.us.archive.org',
                    '/0/items/evadubbed',
                    'Neon Genesis Evangelion - 1x01.mkv',
                    proxyConfig
                  )}
                </div>
              </div>
            </div>

            {/* Auto-Provisioning REST API Script */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <FileCode2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-white">
                    Скрипт автосоздания Raw Proxy репозиториев через REST API (
                    {activeDomainNames.length || 1} доменов)
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <div className="flex bg-[#131A28] p-0.5 rounded-lg border border-[#26334B] text-xs">
                    <button
                      type="button"
                      onClick={() => setProvisionLang('bash')}
                      className={`px-2.5 py-1 rounded-md font-mono ${
                        provisionLang === 'bash'
                          ? 'bg-sky-500 text-[#04111C] font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      Bash (curl)
                    </button>
                    <button
                      type="button"
                      onClick={() => setProvisionLang('powershell')}
                      className={`px-2.5 py-1 rounded-md font-mono ${
                        provisionLang === 'powershell'
                          ? 'bg-sky-500 text-[#04111C] font-bold'
                          : 'text-slate-300'
                      }`}
                    >
                      PowerShell
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => copyText('provision-script', provisionScript)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#192336] hover:bg-[#23314B] border border-[#2D3D5C] text-xs text-slate-100"
                  >
                    {copiedId === 'provision-script' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Скопировано
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-emerald-400" />
                        Копировать скрипт
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      downloadTextFile(
                        provisionLang === 'bash'
                          ? 'setup_archive_raw_proxies.sh'
                          : 'setup_archive_raw_proxies.ps1',
                        provisionScript
                      )
                    }
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-xs text-emerald-200"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {provisionLang === 'bash' ? '.sh' : '.ps1'}
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-xl bg-[#080B10] border border-[#1E283B] text-[11px] font-mono text-slate-200 overflow-x-auto max-h-64 leading-relaxed">
                {provisionScript}
              </pre>
            </div>
          </div>
        )}

        {/* TAB 3: DOWNLOAD QUEUE */}
        {tab === 'queue' && (
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* Queue Summary & Mode Controls */}
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-[#121826] border border-[#222D42]">
              <div className="text-xs space-y-0.5">
                <div className="text-sm font-semibold text-white">
                  Выбрано файлов: {queuedFiles.length} • Общий объём:{' '}
                  <span className="text-emerald-300 font-mono">
                    {formatBytes(totalQueueBytes)}
                  </span>
                </div>
                <div className="text-slate-400">
                  Задействовано файловых доменов:{' '}
                  <strong className="text-sky-300 font-mono">
                    {queueDomainSet.size}
                  </strong>
                  {queueDomainSet.size > 0 && (
                    <span className="ml-1 font-mono text-slate-400">
                      ({Array.from(queueDomainSet).slice(0, 3).join(', ')}
                      {queueDomainSet.size > 3 ? '…' : ''})
                    </span>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex bg-[#0B0F18] p-1 rounded-lg border border-[#25324B] text-xs">
                  <button
                    type="button"
                    onClick={() => setExportViaProxy(true)}
                    className={`px-2.5 py-1 rounded font-medium ${
                      exportViaProxy
                        ? 'bg-emerald-500 text-[#03150C] font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    Через прокси-сервер
                  </button>
                  <button
                    type="button"
                    onClick={() => setExportViaProxy(false)}
                    className={`px-2.5 py-1 rounded font-medium ${
                      !exportViaProxy
                        ? 'bg-sky-500 text-[#04111D] font-bold'
                        : 'text-slate-300'
                    }`}
                  >
                    Прямые ноды IA
                  </button>
                </div>

                {queuedFiles.length > 0 && (
                  <button
                    type="button"
                    onClick={onClearQueue}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-xs text-rose-300"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Очистить корзину
                  </button>
                )}
              </div>
            </div>

            {/* Export Script Generator */}
            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'aria2c', label: 'aria2c (по папкам)' },
                      { id: 'urls', label: 'Список URL (.txt)' },
                      { id: 'wget', label: 'Bash (wget -c)' },
                      { id: 'curl', label: 'Bash (curl -C -)' },
                      { id: 'powershell', label: 'PowerShell' },
                    ] as Array<{ id: ExportScriptFormat; label: string }>
                  ).map((fmt) => (
                    <button
                      key={fmt.id}
                      type="button"
                      onClick={() => setExportFormat(fmt.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        exportFormat === fmt.id
                          ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                          : 'bg-[#131A28] border-[#25324B] text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {fmt.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={queuedFiles.length === 0}
                    onClick={() => copyText('batch-dl', batchDownloadScript)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-xs font-bold text-[#04150D]"
                  >
                    {copiedId === 'batch-dl' ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        Скопировано!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Копировать список / скрипт
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={queuedFiles.length === 0}
                    onClick={() => {
                      const ext =
                        exportFormat === 'powershell'
                          ? 'ps1'
                          : exportFormat === 'wget' || exportFormat === 'curl'
                          ? 'sh'
                          : 'txt';
                      downloadTextFile(`archive_batch_download.${ext}`, batchDownloadScript);
                    }}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#192336] hover:bg-[#23314B] disabled:opacity-40 border border-[#2D3D5C] text-xs text-slate-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Скачать файл
                  </button>
                </div>
              </div>

              <pre className="p-3.5 rounded-xl bg-[#080B10] border border-[#1E283B] text-[11px] font-mono text-slate-200 overflow-x-auto max-h-52 leading-relaxed">
                {batchDownloadScript}
              </pre>
            </div>

            {/* Queued Items List */}
            <div className="border border-[#222D42] rounded-xl overflow-hidden divide-y divide-[#1A2233] bg-[#0B0F17]">
              {queuedFiles.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400">
                  Корзина пуста. Откройте любую папку с аниме/сериалом и нажмите «В корзину» для нужных серий или всего сезона.
                </div>
              ) : (
                queuedFiles.map((f) => {
                  const url = buildActiveFileUrl(f.server, f.dir, f.fileName, {
                    ...proxyConfig,
                    useProxyUrls: exportViaProxy,
                  });
                  return (
                    <div
                      key={f.key}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-4 py-2.5 hover:bg-[#131A28]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-xs font-mono text-slate-100 truncate">
                          {f.fileName}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5 text-[11px] font-mono text-slate-400">
                          <span className="text-sky-300">{f.server}</span>
                          <span>•</span>
                          <span>/{f.identifier}/</span>
                          <span>•</span>
                          <span className="text-emerald-300">
                            {formatBytes(f.sizeBytes)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => copyText(`q-${f.key}`, url)}
                          className="px-2 py-1 rounded bg-[#182234] hover:bg-[#223049] border border-[#2B3A56] text-[11px] font-mono text-slate-200"
                        >
                          {copiedId === `q-${f.key}` ? 'OK' : 'URL'}
                        </button>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1.5 rounded bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-200"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => onRemoveQueueKey(f.key)}
                          className="p-1.5 rounded hover:bg-rose-500/20 text-slate-400 hover:text-rose-300"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
