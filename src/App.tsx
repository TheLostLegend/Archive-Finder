import { useEffect, useState } from "react";

type Doc = { identifier: string; title?: string; downloads?: number; addeddate?: string; publicdate?: string; item_size?: number; mediatype?: string; subject?: string | string[] };
type FileT = { name: string; size?: string; format?: string; source?: string };

const VIDEO = /\.(mp4|mkv|avi|webm|m4v|mov|ogv|mpg|mpeg|wmv|flv|ts)$/i;
const ROWS = 20;

function fmtSize(n?: number | string) {
  const v = Number(n || 0);
  if (!v) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, x = v;
  while (x >= 1024 && i < 4) { x /= 1024; i++; }
  return x.toFixed(1) + " " + u[i];
}

function useCols() {
  const calc = () => Math.max(2, Math.floor(window.innerWidth / 220));
  const [c, setC] = useState(calc);
  useEffect(() => { const f = () => setC(calc()); window.addEventListener("resize", f); return () => window.removeEventListener("resize", f); }, []);
  return c;
}

export default function App() {
  const cols = useCols();
  const [q, setQ] = useState("anime");
  const [query, setQuery] = useState("anime");
  const [sort, setSort] = useState("downloads desc");
  const [safe, setSafe] = useState<"sfw" | "nsfw" | "all">("sfw");
  const [page, setPage] = useState(1);
  const [docs, setDocs] = useState<Doc[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [open, setOpen] = useState<Doc | null>(null);

  const perPage = ROWS * cols;

  useEffect(() => {
    const tags: string[] = [];
    const rest = (query || "").replace(/#("[^"]+"|\S+)/g, (_, t) => { tags.push(t.replace(/"/g, "")); return " "; }).trim();
    let parts = [`(${rest || "*"})`, "mediatype:movies"];
    tags.forEach(t => parts.push(`subject:"${t.replace(/_/g, " ")}"`));
    if (safe === "sfw") parts.push(`NOT collection:no-preview AND NOT subject:(nsfw OR hentai OR adult OR porn OR xxx)`);
    if (safe === "nsfw") parts.push(`(collection:no-preview OR subject:(nsfw OR hentai OR adult OR xxx))`);
    const p = new URLSearchParams({ q: parts.join(" AND "), rows: String(perPage), page: String(page), output: "json" });
    ["identifier", "title", "downloads", "addeddate", "publicdate", "item_size", "mediatype", "subject"].forEach(f => p.append("fl[]", f));
    p.append("sort[]", sort);
    setLoading(true); setErr("");
    fetch("https://archive.org/advancedsearch.php?" + p)
      .then(r => r.json())
      .then(d => { setDocs(d.response.docs); setTotal(d.response.numFound); })
      .catch(e => setErr(String(e)))
      .finally(() => setLoading(false));
  }, [query, sort, safe, page, perPage]);

  const pages = Math.max(1, Math.ceil(total / perPage));

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur border-b border-slate-800 p-3">
        <form className="flex flex-wrap gap-2 items-center" onSubmit={e => { e.preventDefault(); setPage(1); setQuery(q); }}>
          <h1 className="font-bold text-lg mr-2">📼 Archive Content Finder</h1>
          <input className="flex-1 min-w-[200px] bg-slate-800 rounded px-3 py-2" value={q} onChange={e => setQ(e.target.value)} placeholder={`evangelion #anime #"cowboy bebop" ...`} />
          <select className="bg-slate-800 rounded px-2 py-2" value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}>
            <option value="downloads desc">Просмотры ↓</option>
            <option value="downloads asc">Просмотры ↑</option>
            <option value="addeddate desc">Дата добавления ↓</option>
            <option value="addeddate asc">Дата добавления ↑</option>
            <option value="item_size desc">Размер ↓</option>
          </select>
          <select className="bg-slate-800 rounded px-2 py-2" value={safe} onChange={e => { setSafe(e.target.value as any); setPage(1); }}>
            <option value="sfw">SFW</option><option value="nsfw">NSFW</option><option value="all">Все</option>
          </select>
          <button className="bg-indigo-600 hover:bg-indigo-500 rounded px-4 py-2">Найти</button>
        </form>
        <div className="text-xs text-slate-400 mt-1">Найдено: {total.toLocaleString()} · {cols} кол. × {ROWS} строк = {perPage}/стр.</div>
      </header>

      <main className="p-3">
        {err && <div className="text-red-400">{err}</div>}
        {loading ? <div className="text-center p-10">Загрузка…</div> :
          <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0,1fr))` }}>
            {docs.map(d => (
              <button key={d.identifier} onClick={() => setOpen(d)} className="aspect-square overflow-hidden text-left bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded p-2 flex flex-col">
                <div className="h-2/3 w-full bg-black rounded flex items-center justify-center overflow-hidden shrink-0">
                  <img loading="lazy" src={`https://archive.org/services/img/${d.identifier}`} className="max-w-full max-h-full object-contain" />
                </div>
                <div className="min-h-0 flex-1 pt-1 flex flex-col justify-between">
                  <div className="text-sm font-medium line-clamp-2 leading-tight" title={d.title}>{d.title || d.identifier}</div>
                  <div className="text-xs text-slate-400 flex flex-wrap gap-x-2">
                    <span>👁 {(d.downloads ?? 0).toLocaleString()}</span>
                    <span>📅 {(d.publicdate || d.addeddate || "").slice(0, 10)}</span>
                    <span>💾 {fmtSize(d.item_size)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>}
        <div className="flex justify-center items-center gap-2 my-4">
          <button disabled={page <= 1} onClick={() => setPage(1)} className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40">«</button>
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40">‹</button>
          <span>Стр. <input type="number" className="w-16 bg-slate-800 rounded px-1 text-center" value={page} min={1} max={pages} onChange={e => setPage(Math.min(pages, Math.max(1, +e.target.value || 1)))} /> / {pages}</span>
          <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-slate-800 rounded disabled:opacity-40">›</button>
        </div>
      </main>
      {open && <Folder doc={open} onClose={() => setOpen(null)} onTag={t => { const v = `#${t.includes(" ") ? `"${t}"` : t}`; setQ(v); setQuery(v); setPage(1); setOpen(null); }} />}
    </div>
  );
}

function Folder({ doc, onClose, onTag }: { doc: Doc; onClose: () => void; onTag: (t: string) => void }) {
  const [files, setFiles] = useState<FileT[]>([]);
  const [server, setServer] = useState("");
  const [dir, setDir] = useState("");
  const [servers, setServers] = useState<string[]>([]);
  const [ext, setExt] = useState("video");
  const [tags, setTags] = useState<string[]>([]);
  const [desc, setDesc] = useState("");
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState("");

  useEffect(() => {
    fetch(`https://archive.org/metadata/${doc.identifier}`).then(r => r.json()).then(m => {
      setFiles(m.files || []); const sj = m.metadata?.subject; setTags((Array.isArray(sj) ? sj : sj ? String(sj).split(/[;,]/) : []).map((x: string) => x.trim()).filter(Boolean)); setDesc(String(m.metadata?.description || "").replace(/<[^>]+>/g, " ").slice(0, 600)); setServer(m.d1 || m.server || "archive.org"); setDir(m.dir || `/download/${doc.identifier}`);
      setServers([m.d1, m.d2, ...(m.workable_servers || [])].filter((x, i, a) => x && a.indexOf(x) === i));
    }).finally(() => setLoading(false));
  }, [doc.identifier]);

  const extOf = (n: string) => (n.match(/\.([a-z0-9]+)$/i)?.[1] || "—").toLowerCase();
  const exts = [...new Set(files.map(f => extOf(f.name)))].sort();
  const list = files.filter(f => ext === "all" ? true : ext === "video" ? VIDEO.test(f.name) : extOf(f.name) === ext);
  const base = `https://${server}${dir}/`;
  const direct = (f: string) => `https://${server}${dir}/${f.split("/").map(encodeURIComponent).join("/")}`;
  const stable = (f: string) => `https://archive.org/download/${doc.identifier}/${f.split("/").map(encodeURIComponent).join("/")}`;
  const copy = (t: string, k: string) => { navigator.clipboard.writeText(t); setCopied(k); setTimeout(() => setCopied(""), 1200); };

  return (
    <div className="fixed inset-0 z-20 bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div className="bg-slate-900 border border-slate-700 rounded-lg w-full max-w-5xl max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
        <div className="p-3 border-b border-slate-800 flex gap-2 items-start">
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{doc.title || doc.identifier}</div>
            <div className="mt-2 flex gap-2 items-center">
              <span className="text-xs text-slate-400 whitespace-nowrap">Folder base URL</span>
              <input readOnly value={base} onFocus={e => e.target.select()} className="flex-1 min-w-0 bg-slate-800 rounded px-2 py-1 text-sm font-mono" />
              <button className="bg-indigo-600 rounded px-3 py-1 text-sm" onClick={() => copy(base, "base")}>{copied === "base" ? "✓" : "Copy"}</button>
              <a className="text-indigo-400 text-sm" target="_blank" href={`https://archive.org/details/${doc.identifier}`}>details</a>
            </div>
            {servers.length > 1 && <div className="text-xs text-slate-500 mt-1">Серверы: {servers.map(s => <button key={s} onClick={() => setServer(s)} className={`mr-2 ${s === server ? "text-green-400" : "text-slate-300"} underline`}>{s}</button>)}</div>}
            {tags.length > 0 && <div className="mt-2 flex flex-wrap gap-1">{tags.map(t => <button key={t} onClick={() => onTag(t)} className="text-xs bg-slate-800 hover:bg-indigo-700 rounded-full px-2 py-0.5">#{t}</button>)}</div>}
            {desc && <div className="text-xs text-slate-400 mt-2 line-clamp-3">{desc}</div>}
          </div>
          <button onClick={onClose} className="text-2xl px-2">×</button>
        </div>
        <div className="p-2 flex flex-wrap gap-2 text-sm border-b border-slate-800">
          {["all", "video", ...exts].map(x => <button key={x} onClick={() => setExt(x)} className={`rounded px-2 ${ext === x ? "bg-indigo-600" : "bg-slate-800"}`}>{x === "all" ? "Все" : x === "video" ? "Видео" : x}</button>)}
          <span className="flex-1" />
          <button className="bg-slate-800 rounded px-2" onClick={() => copy(list.map(f => direct(f.name)).join("\n"), "all")}>{copied === "all" ? "✓" : "Копировать все прямые"}</button>
          <button className="bg-slate-800 rounded px-2" onClick={() => copy(list.map(f => stable(f.name)).join("\n"), "alls")}>{copied === "alls" ? "✓" : "Копировать все archive.org/download"}</button>
          <button className="bg-slate-800 rounded px-2" onClick={() => copy(list.map(f => `wget -c "${stable(f.name)}"`).join("\n"), "wget")}>{copied === "wget" ? "✓" : "wget скрипт"}</button>
        </div>
        <div className="overflow-auto p-2">
          {loading ? "Загрузка…" : list.length === 0 ? "Нет файлов" :
            <table className="w-full text-sm">
              <tbody>
                {list.map(f => (
                  <tr key={f.name} className="border-b border-slate-800 hover:bg-slate-800/50">
                    <td className="py-1 break-all"><a target="_blank" className="text-indigo-300" href={direct(f.name)}>{f.name}</a></td>
                    <td className="text-slate-400 whitespace-nowrap px-2">{fmtSize(f.size)}</td>
                    <td className="text-slate-500 whitespace-nowrap px-2">{f.source}</td>
                    <td className="whitespace-nowrap"><button className="text-xs bg-slate-800 rounded px-2" onClick={() => copy(direct(f.name), f.name)}>{copied === f.name ? "✓" : "copy"}</button></td>
                  </tr>
                ))}
              </tbody>
            </table>}
        </div>
      </div>
    </div>
  );
}
