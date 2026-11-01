export function formatBytes(bytes?: number | string): string {
  const num = typeof bytes === 'string' ? parseFloat(bytes) : bytes;
  if (!num || isNaN(num) || num <= 0) return '—';
  const units = ['Б', 'КБ', 'МБ', 'ГБ', 'ТБ'];
  const i = Math.min(Math.floor(Math.log(num) / Math.log(1024)), units.length - 1);
  const val = num / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val >= 10 ? val.toFixed(1) : val.toFixed(2)} ${units[i]}`;
}

export function formatNumber(num?: number): string {
  if (num === undefined || num === null || isNaN(num)) return '0';
  return new Intl.NumberFormat('ru-RU').format(num);
}

export function formatCompactNumber(num?: number): string {
  if (!num || isNaN(num)) return '0';
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (num >= 10_000) return `${(num / 1_000).toFixed(0)}K`;
  if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

export function formatDuration(secondsInput?: number | string): string {
  const sec = typeof secondsInput === 'string' ? parseFloat(secondsInput) : secondsInput;
  if (!sec || isNaN(sec) || sec <= 0) return '';
  const total = Math.round(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) {
    return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function formatDate(dateStr?: string): string {
  if (!dateStr) return '—';
  const normalized =
    dateStr.includes(' ') && !dateStr.includes('T')
      ? dateStr.replace(' ', 'T') + 'Z'
      : dateStr;
  const d = new Date(normalized);
  if (isNaN(d.getTime())) return dateStr.slice(0, 10);
  return d.toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/**
 * Safely strips HTML tags and decodes HTML entities into readable plain text.
 */
export function stripHtmlToPlainText(raw?: string): string {
  if (!raw) return '';
  let input = raw;
  if (/&lt;(?:div|p|br|span|a|b|i|ul|ol|li|strong|em)\b/i.test(input)) {
    const decodeDoc = new DOMParser().parseFromString(input, 'text/html');
    input = decodeDoc.documentElement.textContent || input;
  }
  if (typeof DOMParser !== 'undefined' && /<[a-z!/][\s\S]*?>/i.test(input)) {
    const withLineHints = input
      .replace(/<\s*br\s*\/?>/gi, '\n')
      .replace(/<\/\s*(div|p|li|h[1-6]|blockquote|pre|tr)\s*>/gi, '\n');
    const doc = new DOMParser().parseFromString(withLineHints, 'text/html');
    return (doc.body.textContent || '').replace(/\n{3,}/g, '\n\n').trim();
  }
  return input.trim();
}

/**
 * Extracts an Archive.org item identifier if the user pasted:
 * - https://dn801206.us.archive.org/0/items/evadubbed/
 * - https://archive.org/details/evadubbed
 * - https://archive.org/download/evadubbed/episode.mkv
 * - https://archive.org/metadata/evadubbed
 * - id:evadubbed
 */
export function extractDirectArchiveId(rawInput: string): string | null {
  const input = rawInput.trim();
  if (!input) return null;

  const idPrefixMatch = input.match(/^id:([a-zA-Z0-9._-]+)$/i);
  if (idPrefixMatch) return idPrefixMatch[1];

  const itemsNodeMatch = input.match(/\.archive\.org\/\d+\/items\/([a-zA-Z0-9._-]+)/i);
  if (itemsNodeMatch) return itemsNodeMatch[1];

  const standardUrlMatch = input.match(
    /archive\.org\/(?:details|download|metadata|embed)\/([a-zA-Z0-9._-]+)/i
  );
  if (standardUrlMatch) return standardUrlMatch[1];

  return null;
}

const NSFW_REGEX =
  /\b(nsfw|hentai|ecchi|uncensored|eroge|erotica|erotic|18\+|xxx|porn|adult\s+only|mature|lewd|jav|r-18|r18|nude|nudity)\b/i;

export function detectNsfwContent(
  title?: string,
  description?: string,
  subjects?: string[]
): boolean {
  if (title && NSFW_REGEX.test(title)) return true;
  if (subjects && subjects.some((s) => NSFW_REGEX.test(s))) return true;
  if (description) {
    const plain = stripHtmlToPlainText(description).slice(0, 600);
    if (NSFW_REGEX.test(plain)) return true;
  }
  return false;
}

const naturalCollator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base',
});

export function naturalCompare(a: string, b: string): number {
  return naturalCollator.compare(a, b);
}

export function parseDomainInfo(domain: string): {
  shortName: string;
  nodeType: 'dn' | 'ia' | 'other';
  region: string;
} {
  const lower = domain.toLowerCase().trim();
  const shortName = lower.replace(/\.archive\.org$/i, '');
  const parts = shortName.split('.');
  const hostPrefix = parts[0] || '';
  const regionPart = parts[1] ? parts[1].toUpperCase() : 'US';
  const nodeType: 'dn' | 'ia' | 'other' = hostPrefix.startsWith('dn')
    ? 'dn'
    : hostPrefix.startsWith('ia')
    ? 'ia'
    : 'other';

  return {
    shortName,
    nodeType,
    region: regionPart,
  };
}
