import { ProxyMirrorConfig, QueuedDownloadFile } from '../types/archive';

export const DEFAULT_PROXY_CONFIG: ProxyMirrorConfig = {
  useProxyUrls: false,
  proxyBaseUrl: 'http://localhost:8081/repository',
  repoNaming: 'ia-short',
  repoPrefix: 'ia-',
  singleGroupName: 'ia-archive-group',
  blobStoreName: 'default',
  strictContentTypeValidation: false,
};

export function encodeArchiveFilePath(fileName: string): string {
  return fileName
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export function normalizeDir(dir: string): string {
  if (!dir) return '';
  const withLead = dir.startsWith('/') ? dir : `/${dir}`;
  return withLead.endsWith('/') ? withLead.slice(0, -1) : withLead;
}

export function cleanBaseUrl(url: string): string {
  const trimmed = url.trim() || 'http://localhost:8081/repository';
  return trimmed.endsWith('/') ? trimmed.slice(0, -1) : trimmed;
}

export function getProxyRepoNameForDomain(
  domain: string,
  config: ProxyMirrorConfig
): string {
  const cleanDomain = domain.trim().toLowerCase();
  const shortHost = cleanDomain.replace(/\.archive\.org$/i, '');
  const prefix = config.repoPrefix ?? 'ia-';

  switch (config.repoNaming) {
    case 'ia-short':
      return `${prefix}${shortHost}`;
    case 'short-only':
      return shortHost;
    case 'ia-full':
      return `${prefix}${cleanDomain}`;
    case 'single-group':
      return config.singleGroupName.trim() || 'ia-archive-group';
    default:
      return `${prefix}${shortHost}`;
  }
}

export function buildDirectFolderUrl(server: string, dir: string): string {
  return `https://${server}${normalizeDir(dir)}/`;
}

export function buildDirectFileUrl(
  server: string,
  dir: string,
  fileName: string
): string {
  return `https://${server}${normalizeDir(dir)}/${encodeArchiveFilePath(fileName)}`;
}

export function buildProxyFolderUrl(
  server: string,
  dir: string,
  config: ProxyMirrorConfig
): string {
  const base = cleanBaseUrl(config.proxyBaseUrl);
  const repo = getProxyRepoNameForDomain(server, config);
  return `${base}/${repo}${normalizeDir(dir)}/`;
}

export function buildProxyFileUrl(
  server: string,
  dir: string,
  fileName: string,
  config: ProxyMirrorConfig
): string {
  const base = cleanBaseUrl(config.proxyBaseUrl);
  const repo = getProxyRepoNameForDomain(server, config);
  return `${base}/${repo}${normalizeDir(dir)}/${encodeArchiveFilePath(fileName)}`;
}

export function buildActiveFileUrl(
  server: string,
  dir: string,
  fileName: string,
  config: ProxyMirrorConfig
): string {
  return config.useProxyUrls
    ? buildProxyFileUrl(server, dir, fileName, config)
    : buildDirectFileUrl(server, dir, fileName);
}

export function buildActiveFolderUrl(
  server: string,
  dir: string,
  config: ProxyMirrorConfig
): string {
  return config.useProxyUrls
    ? buildProxyFolderUrl(server, dir, config)
    : buildDirectFolderUrl(server, dir);
}

/**
 * Extracts proxy host root (without /repository) for REST API calls
 */
function extractProxyServerRoot(proxyBaseUrl: string): string {
  const cleaned = cleanBaseUrl(proxyBaseUrl);
  return cleaned.replace(/\/repository$/i, '');
}

/**
 * Generates REST API Bash script to auto-create Raw Proxy repositories
 * for all discovered *.archive.org storage domains.
 */
export function generateProxyProvisioningBash(
  domains: string[],
  config: ProxyMirrorConfig
): string {
  const uniqueDomains = Array.from(
    new Set(domains.map((d) => d.trim().toLowerCase()))
  ).sort();
  const serverRoot = extractProxyServerRoot(config.proxyBaseUrl);
  const blobStore = config.blobStoreName.trim() || 'default';
  const strictMime = config.strictContentTypeValidation ? 'true' : 'false';

  const perDomainConfig: ProxyMirrorConfig =
    config.repoNaming === 'single-group'
      ? { ...config, repoNaming: 'ia-short' }
      : config;

  const repoNames = uniqueDomains.map((d) =>
    getProxyRepoNameForDomain(d, perDomainConfig)
  );

  const lines: string[] = [
    '#!/usr/bin/env bash',
    '# Автоматическое создание Raw (proxy) репозиториев через REST API для файловых нод Archive.org',
    `# Сгенерировано IA Video Vault — Доменов: ${uniqueDomains.length}`,
    'set -euo pipefail',
    '',
    `PROXY_SERVER_URL="\${PROXY_SERVER_URL:-${serverRoot}}"`,
    'PROXY_USER="${PROXY_USER:-admin}"',
    'PROXY_PASS="${PROXY_PASS:-YOUR_ADMIN_PASSWORD}"',
    '',
    'create_raw_proxy() {',
    '  local repo_name="$1"',
    '  local remote_url="$2"',
    '  echo "-> Настройка Raw Proxy: ${repo_name} => ${remote_url}"',
    '  http_code=$(curl -s -o /dev/null -w "%{http_code}" -u "${PROXY_USER}:${PROXY_PASS}" \\',
    '    -X POST "${PROXY_SERVER_URL}/service/rest/v1/repositories/raw/proxy" \\',
    '    -H "Content-Type: application/json" \\',
    '    -d "{',
    '      \\"name\\": \\"${repo_name}\\",',
    '      \\"online\\": true,',
    '      \\"storage\\": {',
    `        \\"blobStoreName\\": \\"${blobStore}\\",`,
    `        \\"strictContentTypeValidation\\": ${strictMime}`,
    '      },',
    '      \\"proxy\\": {',
    '        \\"remoteUrl\\": \\"${remote_url}\\",',
    '        \\"contentMaxAge\\": -1,',
    '        \\"metadataMaxAge\\": 1440',
    '      },',
    '      \\"negativeCache\\": {',
    '        \\"enabled\\": true,',
    '        \\"timeToLive\\": 60',
    '      },',
    '      \\"httpClient\\": {',
    '        \\"blocked\\": false,',
    '        \\"autoBlock\\": true',
    '      }',
    '    }")',
    '  echo "   HTTP статус: ${http_code} (201 = создан, 400 = уже существует)"',
    '}',
    '',
  ];

  for (const domain of uniqueDomains) {
    const repoName = getProxyRepoNameForDomain(domain, perDomainConfig);
    lines.push(`create_raw_proxy "${repoName}" "https://${domain}"`);
  }

  if (uniqueDomains.length > 0) {
    const groupName = config.singleGroupName.trim() || 'ia-archive-group';
    const membersJson = repoNames.map((r) => `\\"${r}\\"`).join(', ');
    lines.push(
      '',
      `# (Опционально) Создание общего Raw Group репозитория "${groupName}"`,
      `# Примечание: прямое обращение к конкретному proxy-репозиторию (${repoNames[0] || 'ia-dn801206.us'}) работает быстрее без перебора нод`,
      'if [ "${CREATE_GROUP:-0}" = "1" ]; then',
      `  curl -s -u "\${PROXY_USER}:\${PROXY_PASS}" -X POST "\${PROXY_SERVER_URL}/service/rest/v1/repositories/raw/group" \\`,
      '    -H "Content-Type: application/json" \\',
      `    -d "{\\"name\\":\\"${groupName}\\",\\"online\\":true,\\"storage\\":{\\"blobStoreName\\":\\"${blobStore}\\",\\"strictContentTypeValidation\\":${strictMime}},\\"group\\":{\\"memberNames\\":[${membersJson}]}}"`,
      'fi'
    );
  }

  return lines.join('\n');
}

/**
 * Generates REST API PowerShell script for Windows admins
 */
export function generateProxyProvisioningPowerShell(
  domains: string[],
  config: ProxyMirrorConfig
): string {
  const uniqueDomains = Array.from(
    new Set(domains.map((d) => d.trim().toLowerCase()))
  ).sort();
  const serverRoot = extractProxyServerRoot(config.proxyBaseUrl);
  const blobStore = config.blobStoreName.trim() || 'default';
  const strictMime = config.strictContentTypeValidation ? '$true' : '$false';

  const perDomainConfig: ProxyMirrorConfig =
    config.repoNaming === 'single-group'
      ? { ...config, repoNaming: 'ia-short' }
      : config;

  const lines: string[] = [
    '# PowerShell скрипт создания Raw (proxy) репозиториев через REST API',
    `$ServerUrl = "${serverRoot}"`,
    '$AdminUser = "admin"',
    '$AdminPass = "YOUR_ADMIN_PASSWORD"',
    '',
    '$Pair = "${AdminUser}:${AdminPass}"',
    '$Bytes = [System.Text.Encoding]::ASCII.GetBytes($Pair)',
    '$Base64 = [System.Convert]::ToBase64String($Bytes)',
    '$Headers = @{ Authorization = "Basic $Base64"; "Content-Type" = "application/json" }',
    '',
    '$Domains = @(',
    ...uniqueDomains.map((d) => {
      const repo = getProxyRepoNameForDomain(d, perDomainConfig);
      return `  @{ Repo = "${repo}"; Url = "https://${d}" }`;
    }),
    ')',
    '',
    'foreach ($Item in $Domains) {',
    '  $Body = @{',
    '    name = $Item.Repo',
    '    online = $true',
    `    storage = @{ blobStoreName = "${blobStore}"; strictContentTypeValidation = ${strictMime} }`,
    '    proxy = @{ remoteUrl = $Item.Url; contentMaxAge = -1; metadataMaxAge = 1440 }',
    '    negativeCache = @{ enabled = $true; timeToLive = 60 }',
    '    httpClient = @{ blocked = $false; autoBlock = $true }',
    '  } | ConvertTo-Json -Depth 5',
    '  try {',
    '    Invoke-RestMethod -Method Post -Uri "$ServerUrl/service/rest/v1/repositories/raw/proxy" -Headers $Headers -Body $Body | Out-Null',
    '    Write-Host "[OK] Создан Raw Proxy: $($Item.Repo) -> $($Item.Url)" -ForegroundColor Green',
    '  } catch {',
    '    Write-Host "[SKIP/WARN] $($Item.Repo): $($_.Exception.Message)" -ForegroundColor Yellow',
    '  }',
    '}',
  ];

  return lines.join('\n');
}

export type ExportScriptFormat = 'urls' | 'aria2c' | 'wget' | 'curl' | 'powershell';

export function generateBatchDownloadOutput(
  files: QueuedDownloadFile[],
  config: ProxyMirrorConfig,
  format: ExportScriptFormat,
  overrideUseProxy?: boolean
): string {
  const effectiveConfig: ProxyMirrorConfig =
    overrideUseProxy !== undefined
      ? { ...config, useProxyUrls: overrideUseProxy }
      : config;

  if (files.length === 0) return '# Список выбранных файлов пуст';

  if (format === 'urls') {
    return files
      .map((f) => buildActiveFileUrl(f.server, f.dir, f.fileName, effectiveConfig))
      .join('\n');
  }

  if (format === 'aria2c') {
    const lines = [
      '# Конфиг загрузки для aria2c (запуск: aria2c -i archive_batch_download.txt -j 4 -x 8 -s 8 -c)',
      `# Режим ссылок: ${effectiveConfig.useProxyUrls ? 'Локальный прокси-репозиторий' : 'Прямые файловые ноды Archive.org'}`,
      '',
    ];
    for (const f of files) {
      const url = buildActiveFileUrl(f.server, f.dir, f.fileName, effectiveConfig);
      const cleanOut = f.fileName.replace(/^\/+/, '');
      lines.push(url);
      lines.push(`  dir=${f.identifier}`);
      lines.push(`  out=${cleanOut}`);
    }
    return lines.join('\n');
  }

  if (format === 'wget') {
    const lines = [
      '#!/usr/bin/env bash',
      `# Скрипт скачивания (${files.length} файлов) через ${effectiveConfig.useProxyUrls ? 'прокси-репозиторий' : 'файловые ноды Archive.org'}`,
      'set -u',
      '',
    ];
    for (const f of files) {
      const url = buildActiveFileUrl(f.server, f.dir, f.fileName, effectiveConfig);
      const targetPath = `${f.identifier}/${f.fileName.replace(/^\/+/, '')}`;
      const targetDir = targetPath.includes('/')
        ? targetPath.slice(0, targetPath.lastIndexOf('/'))
        : f.identifier;
      lines.push(`mkdir -p "${targetDir.replace(/"/g, '\\"')}"`);
      lines.push(`wget -c "${url}" -O "${targetPath.replace(/"/g, '\\"')}"`);
    }
    return lines.join('\n');
  }

  if (format === 'curl') {
    const lines = [
      '#!/usr/bin/env bash',
      `# Скрипт скачивания curl с докачкой (${files.length} файлов)`,
      'set -u',
      '',
    ];
    for (const f of files) {
      const url = buildActiveFileUrl(f.server, f.dir, f.fileName, effectiveConfig);
      const targetPath = `${f.identifier}/${f.fileName.replace(/^\/+/, '')}`;
      lines.push(`curl -fL -C - --create-dirs "${url}" -o "${targetPath.replace(/"/g, '\\"')}"`);
    }
    return lines.join('\n');
  }

  // PowerShell
  const psLines = [
    `# PowerShell скрипт скачивания (${files.length} файлов) через curl.exe`,
    '$ErrorActionPreference = "Continue"',
    '',
  ];
  for (const f of files) {
    const url = buildActiveFileUrl(f.server, f.dir, f.fileName, effectiveConfig);
    const targetPath = `${f.identifier}/${f.fileName.replace(/^\/+/, '')}`;
    psLines.push(
      `curl.exe -fL -C - --create-dirs "${url}" -o "${targetPath.replace(/"/g, '`"')}"`
    );
  }
  return psLines.join('\n');
}
