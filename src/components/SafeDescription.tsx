import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, FileText } from 'lucide-react';
import { stripHtmlToPlainText } from '../utils/formatters';

interface SafeDescriptionProps {
  rawDescription: string;
}

const URL_SPLIT_REGEX = /(https?:\/\/[^\s<>"')]+)/gi;

function renderTextWithAutoLinks(text: string, keyPrefix: string): React.ReactNode[] {
  if (!text) return [];
  const parts = text.split(URL_SPLIT_REGEX);
  return parts.map((part, idx) => {
    if (/^https?:\/\//i.test(part)) {
      // Trim trailing punctuation like period or comma attached to URL
      const match = part.match(/^(https?:\/\/[^\s<>"')]+?)([.,;:!?]+)?$/i);
      const cleanUrl = match ? match[1] : part;
      const trailing = match && match[2] ? match[2] : '';
      return (
        <React.Fragment key={`${keyPrefix}-u-${idx}`}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all"
          >
            {cleanUrl}
          </a>
          {trailing}
        </React.Fragment>
      );
    }
    return <React.Fragment key={`${keyPrefix}-t-${idx}`}>{part}</React.Fragment>;
  });
}

function resolveSafeHref(rawHref: string | null): string | null {
  if (!rawHref) return null;
  const trimmed = rawHref.trim();
  if (/^https?:\/\//i.test(trimmed) || /^mailto:/i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('/details/') || trimmed.startsWith('/download/')) {
    return `https://archive.org${trimmed}`;
  }
  return null;
}

const IGNORED_TAGS = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'svg',
  'form',
  'input',
  'button',
  'noscript',
  'meta',
  'link',
]);

function domNodeToReact(
  node: ChildNode,
  key: string,
  insideAnchor = false
): React.ReactNode {
  if (node.nodeType === Node.TEXT_NODE) {
    const txt = node.textContent || '';
    if (!txt) return null;
    if (insideAnchor) return txt;
    return renderTextWithAutoLinks(txt, key);
  }

  if (node.nodeType !== Node.ELEMENT_NODE) {
    return null;
  }

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  if (IGNORED_TAGS.has(tag)) {
    return null;
  }

  if (tag === 'br') {
    return <br key={key} />;
  }

  if (tag === 'hr') {
    return <hr key={key} className="my-2 border-[#222E44]" />;
  }

  const nextInsideAnchor = insideAnchor || tag === 'a';
  const children = Array.from(el.childNodes)
    .map((child, idx) => domNodeToReact(child, `${key}-${idx}`, nextInsideAnchor))
    .filter((c) => c !== null && c !== undefined);

  // Empty spacer <div></div> in WYSIWYG editors
  if (tag === 'div' && children.length === 0) {
    return <div key={key} className="h-2" />;
  }

  switch (tag) {
    case 'p':
      return (
        <p key={key} className="mb-2 last:mb-0 leading-relaxed">
          {children}
        </p>
      );
    case 'div':
    case 'section':
    case 'article':
      return (
        <div key={key} className="mb-1.5 last:mb-0 leading-relaxed">
          {children}
        </div>
      );
    case 'ul':
      return (
        <ul key={key} className="list-disc pl-5 mb-2 space-y-0.5">
          {children}
        </ul>
      );
    case 'ol':
      return (
        <ol key={key} className="list-decimal pl-5 mb-2 space-y-0.5">
          {children}
        </ol>
      );
    case 'li':
      return (
        <li key={key} className="leading-relaxed">
          {children}
        </li>
      );
    case 'b':
    case 'strong':
      return (
        <strong key={key} className="font-semibold text-slate-100">
          {children}
        </strong>
      );
    case 'i':
    case 'em':
      return (
        <em key={key} className="italic text-slate-200">
          {children}
        </em>
      );
    case 'u':
      return (
        <span key={key} className="underline">
          {children}
        </span>
      );
    case 's':
    case 'strike':
    case 'del':
      return (
        <span key={key} className="line-through text-slate-400">
          {children}
        </span>
      );
    case 'code':
      return (
        <code
          key={key}
          className="px-1.5 py-0.5 rounded bg-[#080B10] border border-[#1E293D] font-mono text-[11px] text-sky-300"
        >
          {children}
        </code>
      );
    case 'pre':
      return (
        <pre
          key={key}
          className="p-2.5 my-1.5 rounded-lg bg-[#080B10] border border-[#1E293D] font-mono text-[11px] text-slate-200 overflow-x-auto whitespace-pre-wrap"
        >
          {children}
        </pre>
      );
    case 'blockquote':
      return (
        <blockquote
          key={key}
          className="pl-3 my-1.5 border-l-2 border-sky-500/50 text-slate-300 italic"
        >
          {children}
        </blockquote>
      );
    case 'h1':
    case 'h2':
    case 'h3':
    case 'h4':
    case 'h5':
    case 'h6':
      return (
        <div key={key} className="font-semibold text-slate-100 mt-2 mb-1">
          {children}
        </div>
      );
    case 'a': {
      const safeHref = resolveSafeHref(el.getAttribute('href'));
      if (!safeHref) {
        return <span key={key}>{children}</span>;
      }
      return (
        <a
          key={key}
          href={safeHref}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-400 hover:text-sky-300 underline underline-offset-2 break-all"
        >
          {children.length > 0 ? children : safeHref}
        </a>
      );
    }
    default:
      return <span key={key}>{children}</span>;
  }
}

export const SafeDescription: React.FC<SafeDescriptionProps> = ({
  rawDescription,
}) => {
  const [viewState, setViewState] = useState<'normal' | 'expanded' | 'collapsed'>(
    'normal'
  );

  const { contentNodes, plainLength } = useMemo(() => {
    const trimmed = (rawDescription || '').trim();
    if (!trimmed) {
      return { contentNodes: null, plainLength: 0 };
    }

    let normalized = trimmed;
    // Unescape once if Archive.org stored HTML entities like &lt;div&gt;...
    if (
      typeof DOMParser !== 'undefined' &&
      /&lt;(?:div|p|br|span|a|b|i|ul|ol|li|strong|em|blockquote|pre)\b/i.test(
        normalized
      )
    ) {
      const decodeDoc = new DOMParser().parseFromString(normalized, 'text/html');
      normalized = decodeDoc.documentElement.textContent || normalized;
    }

    const plain = stripHtmlToPlainText(normalized);
    if (!plain) {
      return { contentNodes: null, plainLength: 0 };
    }

    const hasHtmlMarkup = /<[a-z!/][\s\S]*?>/i.test(normalized);

    if (typeof DOMParser !== 'undefined' && hasHtmlMarkup) {
      const doc = new DOMParser().parseFromString(normalized, 'text/html');
      const nodes = Array.from(doc.body.childNodes)
        .map((n, idx) => domNodeToReact(n, `desc-${idx}`))
        .filter((n) => n !== null && n !== undefined);
      return { contentNodes: nodes, plainLength: plain.length };
    }

    // Pure plain text: preserve paragraphs & single line breaks + auto-link URLs
    const paragraphs = normalized.split(/\n{2,}/);
    const nodes = paragraphs.map((para, pIdx) => {
      const lines = para.split('\n');
      return (
        <p key={`p-${pIdx}`} className="mb-2 last:mb-0 leading-relaxed">
          {lines.map((line, lIdx) => (
            <React.Fragment key={`p-${pIdx}-l-${lIdx}`}>
              {lIdx > 0 && <br />}
              {renderTextWithAutoLinks(line, `p-${pIdx}-l-${lIdx}`)}
            </React.Fragment>
          ))}
        </p>
      );
    });

    return { contentNodes: nodes, plainLength: plain.length };
  }, [rawDescription]);

  if (!contentNodes || plainLength === 0) return null;

  const isLong = plainLength > 260;

  return (
    <div className="mt-2.5 rounded-xl bg-[#0B0F18] border border-[#1F2A3E] overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-[#0F1522] border-b border-[#1B2436] text-[11px]">
        <span className="inline-flex items-center gap-1.5 font-medium text-slate-300">
          <FileText className="w-3.5 h-3.5 text-sky-400" />
          Описание папки
        </span>

        <div className="flex items-center gap-2">
          {isLong && viewState !== 'collapsed' && (
            <button
              type="button"
              onClick={() =>
                setViewState((s) => (s === 'expanded' ? 'normal' : 'expanded'))
              }
              className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 font-medium"
            >
              {viewState === 'expanded' ? (
                <>
                  <ChevronUp className="w-3.5 h-3.5" />
                  Компактная высота
                </>
              ) : (
                <>
                  <ChevronDown className="w-3.5 h-3.5" />
                  Развернуть полностью
                </>
              )}
            </button>
          )}
          <button
            type="button"
            onClick={() =>
              setViewState((s) => (s === 'collapsed' ? 'normal' : 'collapsed'))
            }
            className="text-slate-400 hover:text-slate-200"
          >
            {viewState === 'collapsed' ? 'Показать' : 'Скрыть'}
          </button>
        </div>
      </div>

      {viewState !== 'collapsed' && (
        <div
          className={`px-3.5 py-2.5 text-xs text-slate-300 break-words overflow-y-auto ${
            viewState === 'expanded'
              ? 'max-h-72'
              : isLong
              ? 'max-h-28'
              : ''
          }`}
        >
          {contentNodes}
        </div>
      )}
    </div>
  );
};
