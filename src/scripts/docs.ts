/**
 * Builds documentation/ (index.html, docs.js, docs-init.js) from the Postman collection, so the docs always match it.
 * English comes from the collection; Bahasa Indonesia from docs.id.md next to this file (EN / ID switch on the page).
 * Each folder also gets flowcharts (inline SVG, both languages) from docs.flows.ts.
 * Run: npm run docs. Served by the backend at /docs; documentation/index.html also opens directly in a browser.
 */
import fs from 'node:fs';
import path from 'node:path';
import { ALL_ROLES } from '../constants/roles';
import { renderFlows } from './docs.flows';

const ROOT = path.resolve(__dirname, '../..');
const COLLECTION = path.join(ROOT, 'postman/Prafi-API.postman_collection.json');
const OUT_DIR = path.join(ROOT, 'documentation');

interface PmUrl {
  raw?: string;
  query?: { key: string; value: string; disabled?: boolean; description?: string }[];
}
interface PmRequest {
  name: string;
  request: {
    method: string;
    url: PmUrl | string;
    description?: string;
    auth?: { type: string };
    body?: { mode: string; raw?: string; formdata?: { key: string; type?: string; value?: string; src?: string }[] };
  };
}
interface PmFolder {
  name: string;
  description?: string;
  item: PmRequest[];
}

const collection = JSON.parse(fs.readFileSync(COLLECTION, 'utf8')) as {
  info: { name: string; description?: string };
  item: PmFolder[];
};

// ---------- small Markdown renderer (covers what the collection descriptions use) ----------

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function inline(text: string) {
  // Code spans first, so ** or * inside them are left alone
  const codes: string[] = [];
  let s = escapeHtml(text).replace(/`([^`]+)`/g, (_m, code: string) => {
    codes.push(`<code>${code}</code>`);
    return `\u0000${codes.length - 1}\u0000`;
  });
  s = s
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>');
  return s.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => codes[Number(i)]);
}

function markdown(md: string): string {
  const lines = md.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let i = 0;
  const isTableRow = (l: string) => /^\s*\|.*\|\s*$/.test(l);
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());

  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^```(\w*)/);
    if (fence) {
      const code: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith('```')) code.push(lines[i++]);
      i++;
      out.push(`<pre><code class="lang-${fence[1] || 'text'}">${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.*)/);
    if (heading) {
      const level = Math.min(heading[1].length + 1, 5);
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`);
      i++;
      continue;
    }

    if (isTableRow(line) && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const head = cells(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && isTableRow(lines[i])) rows.push(cells(lines[i++]));
      out.push(
        `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>` +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table></div>',
      );
      continue;
    }

    if (line.startsWith('>')) {
      const quote: string[] = [];
      while (i < lines.length && lines[i].startsWith('>')) quote.push(lines[i++].replace(/^>\s?/, ''));
      out.push(`<blockquote>${markdown(quote.join('\n'))}</blockquote>`);
      continue;
    }

    const list = line.match(/^(\s*)([-*]|\d+\.)\s+/);
    if (list) {
      const ordered = /\d/.test(list[2]);
      const items: string[] = [];
      while (i < lines.length && /^\s*([-*]|\d+\.)\s+/.test(lines[i])) items.push(lines[i++].replace(/^\s*([-*]|\d+\.)\s+/, ''));
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((it) => `<li>${inline(it)}</li>`).join('')}</${tag}>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(```|#{1,4}\s|>|\s*([-*]|\d+\.)\s+)/.test(lines[i]) && !isTableRow(lines[i])) {
      para.push(lines[i++]);
    }
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    else i++;
  }
  return out.join('\n');
}

// ---------- languages ----------
// English comes from the Postman collection; Bahasa Indonesia from docs.id.md (same sections, matched by name).

type Lang = 'en' | 'id';
interface Translated {
  title?: string;
  md: string;
}

function loadIndonesian() {
  const file = path.join(__dirname, 'docs.id.md');
  const result = { overview: undefined as string | undefined, folders: new Map<string, Translated>(), requests: new Map<string, Translated>() };
  if (!fs.existsSync(file)) return result;
  const parts = fs.readFileSync(file, 'utf8').replace(/\r/g, '').split(/^=== /m).slice(1);
  for (const part of parts) {
    const [head, ...rest] = part.split('\n');
    const md = rest.join('\n').trim();
    if (head.trim() === 'OVERVIEW') {
      result.overview = md;
      continue;
    }
    const m = head.match(/^(FOLDER|REQ)\s+(.+?)(?:\s*=>\s*(.+))?\s*$/);
    if (!m) continue;
    (m[1] === 'FOLDER' ? result.folders : result.requests).set(m[2], { title: m[3]?.trim(), md });
  }
  return result;
}
const id = loadIndonesian();

const missing: string[] = [];
const missingFlows: string[] = [];
if (!id.overview) missing.push('OVERVIEW');
for (const f of collection.item) {
  if (!id.folders.has(f.name)) missing.push(`FOLDER ${f.name}`);
  for (const r of f.item) if (!id.requests.has(r.name)) missing.push(`REQ ${r.name}`);
}

/** Interface text in both languages. */
const UI = {
  overview: { en: 'Overview', id: 'Ringkasan' },
  endpoints: { en: 'endpoints', id: 'endpoint' },
  endpoint: { en: 'endpoint', id: 'endpoint' },
  groups: { en: 'groups', id: 'grup' },
  roles: { en: 'roles', id: 'role' },
  methods: { en: 'get · post · patch · delete', id: 'get · post · patch · delete' },
  hero: {
    en: 'Backend for Prafi: accounts and roles, tenants, products, approvals and realtime notifications. Every request below shows who can call it.',
    id: 'Backend untuk Prafi: akun dan role, tenant, produk, persetujuan, dan notifikasi realtime. Setiap request di bawah menunjukkan siapa yang boleh memanggilnya.',
  },
  baseUrl: { en: 'Base URL', id: 'Base URL' },
  copy: { en: 'Copy', id: 'Salin' },
  queryParams: { en: 'Query parameters', id: 'Parameter query' },
  requestBody: { en: 'Request body', id: 'Body request' },
  name: { en: 'name', id: 'nama' },
  example: { en: 'example', id: 'contoh' },
  required: { en: 'required', id: 'wajib' },
  optional: { en: 'optional', id: 'opsional' },
  yes: { en: 'yes', id: 'ya' },
  field: { en: 'field', id: 'field' },
  type: { en: 'type', id: 'tipe' },
  noAuth: { en: 'No authentication needed', id: 'Tanpa autentikasi' },
  authorization: { en: 'Authorization:', id: 'Otorisasi:' },
  flowchart: { en: 'Flowchart', id: 'Diagram alur' },
  lgStart: { en: 'Request', id: 'Request' },
  lgCheck: { en: 'Check', id: 'Pengecekan' },
  lgError: { en: 'Error response', id: 'Respons error' },
  lgOk: { en: 'Success', id: 'Berhasil' },
  lgEffect: { en: 'Side effect', id: 'Efek samping' },
  lgNote: { en: 'Note', id: 'Catatan' },
  footer: {
    en: 'Generated from <code>postman/Prafi-API.postman_collection.json</code> on {date} · regenerate with <code>npm run docs</code>',
    id: 'Dibuat dari <code>postman/Prafi-API.postman_collection.json</code> pada {date} · buat ulang dengan <code>npm run docs</code>',
  },
} satisfies Record<string, Record<Lang, string>>;
const ROLE_LABELS: Record<string, Record<Lang, string>> = {
  'All roles': { en: 'All roles', id: 'Semua role' },
  Public: { en: 'Public', id: 'Publik' },
};

/** Inline text in both languages; only the active one is shown (CSS on <html data-lang>). */
const t = (pair: Record<Lang, string>) =>
  pair.en === pair.id ? pair.en : `<span data-l="en">${pair.en}</span><span data-l="id">${pair.id}</span>`;
/** A block (rendered Markdown) in both languages; falls back to English when there is no translation. */
const block = (enMd: string, idMd: string | undefined, tag = 'div', cls = '') => {
  const en = markdown(enMd);
  const idHtml = idMd === undefined ? en : markdown(idMd);
  const c = cls ? ` class="${cls}"` : '';
  return en === idHtml ? `<${tag}${c}>${en}</${tag}>` : `<${tag}${c} data-l="en">${en}</${tag}><${tag}${c} data-l="id">${idHtml}</${tag}>`;
};

// ---------- page ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const splitName = (name: string) => {
  const m = name.match(/^(.*?)\s*\(([^)]*)\)$/);
  return m ? { title: m[1], access: m[2] } : { title: name, access: '' };
};
const urlOf = (u: PmUrl | string) => (typeof u === 'string' ? u : u.raw ?? '');
const folderTitle = (f: PmFolder) => ({ en: escapeHtml(f.name), id: escapeHtml(id.folders.get(f.name)?.title ?? f.name) });
const requestTitle = (r: PmRequest) => {
  const { title } = splitName(r.name);
  return { en: escapeHtml(title), id: escapeHtml(id.requests.get(r.name)?.title ?? title) };
};

function accessBadges(access: string) {
  if (!access) return '';
  return access
    .split(',')
    .map((a) => a.trim())
    .map((a) => `<span class="badge role-${slug(a)}">${t(ROLE_LABELS[a] ?? { en: escapeHtml(a), id: escapeHtml(a) })}</span>`)
    .join('');
}

const copyButton = (text: string) =>
  `<button class="copy" type="button" data-copy="${escapeHtml(text)}">${t(UI.copy)}</button>`;

function requestBlock(folder: PmFolder, r: PmRequest) {
  const { title, access } = splitName(r.name);
  const anchor = `${slug(folder.name)}--${slug(title)}`;
  const names = requestTitle(r);
  const method = r.request.method.toUpperCase();
  const url = urlOf(r.request.url);
  const query = typeof r.request.url === 'string' ? [] : r.request.url.query ?? [];
  const desc = (r.request.description ?? '').replace(/^\*\*Access:\*\*[^\n]*\n*/, '');
  const isPublic = r.request.auth?.type === 'noauth';

  let body = '';
  if (r.request.body?.mode === 'raw' && r.request.body.raw) {
    body =
      `<div class="block-head"><h4>${t(UI.requestBody)} <span class="muted">application/json</span></h4>${copyButton(r.request.body.raw)}</div>` +
      `<pre><code class="lang-json">${escapeHtml(r.request.body.raw)}</code></pre>`;
  } else if (r.request.body?.mode === 'formdata') {
    body =
      `<h4>${t(UI.requestBody)} <span class="muted">multipart/form-data</span></h4><div class="table-wrap"><table><thead><tr><th>${t(UI.field)}</th><th>${t(UI.type)}</th><th>${t(UI.example)}</th></tr></thead><tbody>` +
      (r.request.body.formdata ?? [])
        .map((f) => `<tr><td><code>${escapeHtml(f.key)}</code></td><td>${escapeHtml(f.type ?? 'text')}</td><td>${escapeHtml(f.value ?? f.src ?? '')}</td></tr>`)
        .join('') +
      '</tbody></table></div>';
  }
  const params = query.length
    ? `<h4>${t(UI.queryParams)}</h4><div class="table-wrap"><table><thead><tr><th>${t(UI.name)}</th><th>${t(UI.example)}</th><th>${t(UI.required)}</th></tr></thead><tbody>` +
      query
        .map((q) => `<tr><td><code>${escapeHtml(q.key)}</code></td><td><code>${escapeHtml(q.value)}</code></td><td>${q.disabled ? `<span class="muted">${t(UI.optional)}</span>` : t(UI.yes)}</td></tr>`)
        .join('') +
      '</tbody></table></div>'
    : '';
  const searchText = `${folder.name} ${id.folders.get(folder.name)?.title ?? ''} ${r.name} ${names.id} ${method} ${url}`.toLowerCase();

  return `
<article class="endpoint m-${method.toLowerCase()}" id="${anchor}" data-search="${escapeHtml(searchText)}">
  <header class="endpoint-head">
    <h3><a href="#${anchor}">${t(names)}</a></h3>
    <div class="badges">${accessBadges(access)}</div>
  </header>
  <div class="url">
    <span class="method">${method}</span>
    <code class="url-text">${escapeHtml(url)}</code>
    ${copyButton(url)}
  </div>
  <p class="auth">${isPublic ? `<span class="dot dot-open"></span>${t(UI.noAuth)}` : `<span class="dot dot-lock"></span>${t(UI.authorization)} <code>Bearer {{token}}</code>`}</p>
  <div class="endpoint-body">
    ${desc.trim() ? block(desc, id.requests.get(r.name)?.md || undefined) : ''}
    ${params}
    ${body}
  </div>
</article>`;
}

const folders = collection.item;
const nav = folders
  .map(
    (f) => `
  <li class="nav-folder" data-folder="${slug(f.name)}">
    <a class="nav-folder-link" href="#${slug(f.name)}">${t(folderTitle(f))}<span class="count">${f.item.length}</span></a>
    <ul>${f.item
      .map((r) => {
        const { title } = splitName(r.name);
        const names = requestTitle(r);
        const m = r.request.method.toUpperCase();
        const searchText = `${f.name} ${id.folders.get(f.name)?.title ?? ''} ${r.name} ${names.id} ${m} ${urlOf(r.request.url)}`.toLowerCase();
        return `<li data-search="${escapeHtml(searchText)}"><a href="#${slug(f.name)}--${slug(title)}"><span class="nav-method m-${m.toLowerCase()}">${m === 'DELETE' ? 'DEL' : m}</span><span>${t(names)}</span></a></li>`;
      })
      .join('')}</ul>
  </li>`,
  )
  .join('');

/** Collapsible flowcharts for a folder (open by default), one SVG set per language. */
function flowsBlock(f: PmFolder) {
  const en = renderFlows(f.name, 'en');
  const idHtml = renderFlows(f.name, 'id');
  if (!en || !idHtml) return '';
  const legend = (
    [['start', UI.lgStart], ['check', UI.lgCheck], ['error', UI.lgError], ['end', UI.lgOk], ['effect', UI.lgEffect], ['note', UI.lgNote]] as const
  )
    .map(([kind, label]) => `<span class="lg lg-${kind}">${t(label)}</span>`)
    .join('');
  return `<details class="flows" open>
  <summary>${t(UI.flowchart)}</summary>
  <div class="legend">${legend}</div>
  <div class="flow-grid" data-l="en">${en}</div>
  <div class="flow-grid" data-l="id">${idHtml}</div>
</details>`;
}
for (const f of collection.item) if (!renderFlows(f.name, 'en')) missingFlows.push(f.name);

const sections = folders
  .map(
    (f) => `
<section class="folder" id="${slug(f.name)}">
  <div class="folder-title"><h2>${t(folderTitle(f))}</h2><span class="pill">${f.item.length} ${t(f.item.length === 1 ? UI.endpoint : UI.endpoints)}</span></div>
  ${block(f.description ?? '', id.folders.get(f.name)?.md || undefined, 'div', 'folder-desc')}
  ${flowsBlock(f)}
  ${f.item.map((r) => requestBlock(f, r)).join('\n')}
</section>`,
  )
  .join('\n');

const requestCount = folders.reduce((n, f) => n + f.item.length, 0);
const methodCount = (m: string) => folders.reduce((n, f) => n + f.item.filter((r) => r.request.method.toUpperCase() === m).length, 0);
const generatedAt = new Date().toISOString().slice(0, 10);
const title = collection.info.name;


// ---------- styles ----------

const css = `
:root {
  --fc-line: #94a3b8;
  --bg: #f5f7fb; --surface: #ffffff; --surface-2: #f8fafc; --text: #0f172a; --muted: #64748b; --border: #e4e8f0;
  --primary: #4f46e5; --primary-soft: #eef2ff; --shadow: 0 1px 2px rgba(15,23,42,.04), 0 6px 18px rgba(15,23,42,.06);
  --hero: linear-gradient(120deg, #4338ca 0%, #7c3aed 45%, #db2777 100%);
  --code-bg: #0f172a; --code-text: #e2e8f0; --inline-code: #eef2ff; --inline-code-text: #4338ca;
  --get: #059669; --get-soft: #ecfdf5; --post: #ea580c; --post-soft: #fff7ed;
  --patch: #7c3aed; --patch-soft: #f5f3ff; --put: #2563eb; --put-soft: #eff6ff; --delete: #e11d48; --delete-soft: #fff1f2;
  --r-public: #047857; --r-public-bg: #d1fae5; --r-all: #1d4ed8; --r-all-bg: #dbeafe; --r-superadmin: #be123c; --r-superadmin-bg: #ffe4e6;
  --r-admin: #b45309; --r-admin-bg: #fef3c7; --r-tenant: #6d28d9; --r-tenant-bg: #ede9fe;
  --r-disnakertrans: #0e7490; --r-disnakertrans-bg: #cffafe;
  --method-text: #ffffff;
}
:root[data-theme="dark"] {
  --fc-line: #55617e;
  --bg: #0b1020; --surface: #121a2e; --surface-2: #0f1628; --text: #e5e9f5; --muted: #94a0bb; --border: #232e48;
  --primary: #8b9cff; --primary-soft: #1c2547; --shadow: 0 1px 2px rgba(0,0,0,.3), 0 8px 24px rgba(0,0,0,.25);
  --code-bg: #070b16; --code-text: #e2e8f0; --inline-code: #1c2547; --inline-code-text: #b4c0ff;
  --get: #34d399; --get-soft: #0b2a22; --post: #fb923c; --post-soft: #2e1a0c;
  --patch: #a78bfa; --patch-soft: #221a3d; --put: #60a5fa; --put-soft: #0f2140; --delete: #fb7185; --delete-soft: #33121c;
  --r-public: #6ee7b7; --r-public-bg: #0b2a22; --r-all: #93c5fd; --r-all-bg: #0f2140; --r-superadmin: #fda4af; --r-superadmin-bg: #33121c;
  --r-admin: #fcd34d; --r-admin-bg: #2e220a; --r-tenant: #c4b5fd; --r-tenant-bg: #221a3d;
  --r-disnakertrans: #67e8f9; --r-disnakertrans-bg: #0b2a33;
  --method-text: #0b1020;
}
* { box-sizing: border-box; }
html { scroll-padding-top: 80px; scroll-behavior: smooth; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.65 "Plus Jakarta Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; -webkit-font-smoothing: antialiased; }
a { color: var(--primary); text-decoration: none; }
a:hover { text-decoration: underline; }
code, pre { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Consolas, monospace; }
code { font-size: .84em; background: var(--inline-code); color: var(--inline-code-text); padding: .12em .4em; border-radius: 5px; overflow-wrap: break-word; }
pre { background: var(--code-bg); color: var(--code-text); border-radius: 12px; padding: 16px 18px; overflow-x: auto; margin: 8px 0 14px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.04); }
pre code { background: none; color: inherit; padding: 0; font-size: 13px; line-height: 1.6; overflow-wrap: normal; }
.muted { color: var(--muted); font-weight: 400; }

/* top bar */
.topbar { position: sticky; top: 0; z-index: 20; display: flex; align-items: center; gap: 14px; height: 64px; padding: 0 22px; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(10px); border-bottom: 1px solid var(--border); }
.logo { display: flex; align-items: center; gap: 10px; font-weight: 800; font-size: 17px; color: var(--text); letter-spacing: -.01em; }
.logo-mark { width: 32px; height: 32px; border-radius: 9px; background: var(--hero); display: grid; place-items: center; color: #fff; font-size: 15px; font-weight: 800; box-shadow: 0 4px 12px rgba(124,58,237,.35); }
.logo small { font-weight: 600; color: var(--muted); font-size: 12px; padding: 2px 8px; border: 1px solid var(--border); border-radius: 999px; }
.search-wrap { flex: 1; max-width: 460px; margin-left: auto; position: relative; }
.search-wrap svg { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted); }
#search { width: 100%; height: 40px; padding: 0 12px 0 38px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface-2); color: var(--text); font: inherit; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
#search:focus { border-color: var(--primary); box-shadow: 0 0 0 4px var(--primary-soft); }
.icon-btn { height: 40px; min-width: 40px; padding: 0 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; font-size: 14px; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; }
.icon-btn:hover { border-color: var(--primary); color: var(--primary); }
#menu-toggle { display: none; }

/* layout */
.layout { display: flex; align-items: flex-start; }
aside { width: 300px; flex-shrink: 0; position: sticky; top: 64px; height: calc(100vh - 64px); overflow-y: auto; padding: 18px 14px 40px; background: var(--surface); border-right: 1px solid var(--border); }
aside ul { list-style: none; margin: 0; padding: 0; }
.nav-folder { margin: 2px 0 10px; }
.nav-folder-link { display: flex; justify-content: space-between; align-items: center; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 6px 10px; border-radius: 8px; }
.nav-folder-link:hover { color: var(--text); text-decoration: none; background: var(--surface-2); }
.count { font-size: 11px; font-weight: 700; color: var(--primary); background: var(--primary-soft); border-radius: 999px; padding: 1px 8px; letter-spacing: 0; }
.nav-folder ul li a { display: flex; gap: 8px; align-items: center; padding: 5px 10px; color: var(--text); font-size: 14px; border-radius: 8px; border-left: 3px solid transparent; }
.nav-folder ul li a:hover { background: var(--surface-2); text-decoration: none; }
.nav-folder ul li a.active { background: var(--primary-soft); color: var(--primary); font-weight: 600; border-left-color: var(--primary); }
.nav-method { font: 700 10px/1 "JetBrains Mono", Consolas, monospace; width: 40px; flex-shrink: 0; }
.nav-method.m-get { color: var(--get); } .nav-method.m-post { color: var(--post); } .nav-method.m-patch { color: var(--patch); } .nav-method.m-put { color: var(--put); } .nav-method.m-delete { color: var(--delete); }
main { flex: 1; min-width: 0; padding: 26px 36px 90px; }
.content { max-width: 960px; margin: 0 auto; }

/* hero */
.hero { position: relative; overflow: hidden; background: var(--hero); color: #fff; border-radius: 20px; padding: 34px 34px 28px; box-shadow: 0 18px 40px -18px rgba(124,58,237,.6); }
.hero::after { content: ""; position: absolute; right: -80px; top: -80px; width: 280px; height: 280px; border-radius: 50%; background: rgba(255,255,255,.12); }
.hero::before { content: ""; position: absolute; right: 120px; bottom: -120px; width: 220px; height: 220px; border-radius: 50%; background: rgba(255,255,255,.08); }
.hero h1 { margin: 0 0 6px; font-size: 34px; font-weight: 800; letter-spacing: -.02em; position: relative; }
.hero p { margin: 0; opacity: .92; position: relative; max-width: 640px; }
.hero code { background: rgba(255,255,255,.18); color: #fff; }
.base-url { position: relative; margin-top: 18px; display: inline-flex; align-items: center; gap: 10px; background: rgba(15,23,42,.28); border: 1px solid rgba(255,255,255,.25); border-radius: 12px; padding: 8px 8px 8px 14px; font-size: 14px; }
.base-url code { background: none; padding: 0; font-size: 14px; }
.base-url .copy { background: rgba(255,255,255,.2); color: #fff; border-color: transparent; }
.stats { position: relative; display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 12px; margin-top: 22px; }
.stat { background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.2); border-radius: 14px; padding: 12px 14px; }
.stat b { display: block; font-size: 24px; line-height: 1.2; }
.stat span { font-size: 12px; opacity: .85; text-transform: uppercase; letter-spacing: .06em; }

/* overview + sections */
.overview { margin-top: 26px; background: var(--surface); border: 1px solid var(--border); border-radius: 18px; padding: 8px 30px 22px; box-shadow: var(--shadow); }
.overview h3 { font-size: 19px; margin: 26px 0 8px; display: flex; align-items: center; gap: 10px; }
.overview h3::before { content: ""; width: 6px; height: 20px; border-radius: 3px; background: var(--hero); }
.folder { margin-top: 56px; }
.folder-title { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.folder-title h2 { margin: 0; font-size: 26px; font-weight: 800; letter-spacing: -.01em; }
.pill { font-size: 12px; font-weight: 700; color: var(--primary); background: var(--primary-soft); padding: 3px 10px; border-radius: 999px; }
.folder-desc { color: var(--text); margin: 8px 0 6px; }
.table-wrap { overflow-x: auto; }
table { border-collapse: separate; border-spacing: 0; margin: 10px 0 14px; font-size: 14px; min-width: 50%; border: 1px solid var(--border); border-radius: 12px; overflow: hidden; background: var(--surface); }
th, td { padding: 8px 12px; text-align: left; vertical-align: top; border-bottom: 1px solid var(--border); }
tr:last-child td { border-bottom: 0; }
th { background: var(--surface-2); font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
tbody tr:hover td { background: var(--surface-2); }
blockquote { margin: 14px 0; padding: 6px 16px; border-left: 4px solid var(--primary); background: var(--primary-soft); border-radius: 0 12px 12px 0; }

/* endpoint cards */
.endpoint { --accent: var(--primary); --accent-soft: var(--primary-soft); position: relative; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px 22px 8px; margin: 18px 0; box-shadow: var(--shadow); transition: transform .15s, box-shadow .15s; overflow: hidden; }
.endpoint::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 4px; background: var(--accent); }
.endpoint:hover { transform: translateY(-1px); box-shadow: 0 2px 4px rgba(15,23,42,.05), 0 12px 28px rgba(15,23,42,.09); }
.endpoint:target { box-shadow: 0 0 0 3px var(--accent-soft), var(--shadow); }
.endpoint.m-get { --accent: var(--get); --accent-soft: var(--get-soft); }
.endpoint.m-post { --accent: var(--post); --accent-soft: var(--post-soft); }
.endpoint.m-patch { --accent: var(--patch); --accent-soft: var(--patch-soft); }
.endpoint.m-put { --accent: var(--put); --accent-soft: var(--put-soft); }
.endpoint.m-delete { --accent: var(--delete); --accent-soft: var(--delete-soft); }
.endpoint-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.endpoint-head h3 { margin: 0; font-size: 18px; font-weight: 700; }
.endpoint-head h3 a { color: var(--text); }
.badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge { font-size: 12px; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
.role-public { color: var(--r-public); background: var(--r-public-bg); }
.role-all-roles { color: var(--r-all); background: var(--r-all-bg); }
.role-superadmin { color: var(--r-superadmin); background: var(--r-superadmin-bg); }
.role-admin { color: var(--r-admin); background: var(--r-admin-bg); }
.role-tenant { color: var(--r-tenant); background: var(--r-tenant-bg); }
.role-disnakertrans { color: var(--r-disnakertrans); background: var(--r-disnakertrans-bg); }
.url { display: flex; align-items: center; gap: 10px; margin: 12px 0 6px; background: var(--accent-soft); border-radius: 12px; padding: 7px 7px 7px 8px; }
.method { font: 800 12px/1 "JetBrains Mono", Consolas, monospace; padding: 7px 10px; border-radius: 8px; color: var(--method-text); background: var(--accent); letter-spacing: .03em; }
.url-text { flex: 1; min-width: 0; background: none; color: var(--text); padding: 0; font-size: 14px; }
.copy { flex-shrink: 0; font: 600 12px/1 inherit; font-family: inherit; padding: 7px 10px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--muted); cursor: pointer; }
.copy:hover { color: var(--primary); border-color: var(--primary); }
.copy.done { color: var(--get); border-color: var(--get); }
.auth { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; margin: 6px 0 4px; }
.dot { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }
.dot-open { background: var(--get); } .dot-lock { background: var(--post); }
.endpoint-body h4 { font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); margin: 16px 0 6px; }
.block-head { display: flex; align-items: center; justify-content: space-between; }
.block-head .copy { margin-top: 8px; }
.hidden { display: none !important; }
.to-top { position: fixed; right: 22px; bottom: 22px; width: 44px; height: 44px; border-radius: 50%; border: 0; background: var(--hero); color: #fff; font-size: 18px; cursor: pointer; box-shadow: 0 8px 20px rgba(124,58,237,.4); opacity: 0; pointer-events: none; transition: opacity .2s; }
.to-top.show { opacity: 1; pointer-events: auto; }
footer { text-align: center; color: var(--muted); font-size: 13px; margin-top: 60px; }

/* flowcharts */
.flows { margin: 16px 0 8px; background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 4px 18px 10px; box-shadow: var(--shadow); }
.flows > summary { cursor: pointer; font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 10px 0; list-style-position: inside; }
.flows > summary:hover { color: var(--primary); }
.legend { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 6px; font-size: 12px; }
.lg { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); }
.lg::before { content: ""; width: 14px; height: 10px; border-radius: 3px; border: 1.5px solid var(--fc-stroke); background: var(--fc-fill); }
.flow-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 400px), 1fr)); gap: 6px 22px; }
.flow { margin: 10px 0; min-width: 0; }
.flow figcaption { font-weight: 700; font-size: 14px; margin-bottom: 6px; }
.fc { display: block; width: 100%; max-width: 480px; height: auto; }
.fc-text { font-size: 12px; fill: var(--text); }
.fc-code { font-family: "JetBrains Mono", ui-monospace, Consolas, monospace; font-size: 11px; fill: var(--inline-code-text); }
.fc-label { font-size: 11px; font-weight: 700; fill: var(--muted); }
.fc-line { stroke: var(--fc-line); stroke-width: 1.5; }
.fc-line-effect { stroke: var(--patch); stroke-dasharray: 5 4; }
.fc-line-note { stroke-dasharray: 2 3; }
.fc-arrowhead { fill: var(--fc-line); }
.fc-box, .lg { --fc-fill: var(--surface); --fc-stroke: var(--border); }
.fc-box { fill: var(--fc-fill); stroke: var(--fc-stroke); stroke-width: 1.5; }
.fc-start, .lg-start { --fc-fill: var(--primary-soft); --fc-stroke: var(--primary); }
.fc-check, .lg-check { --fc-fill: var(--r-admin-bg); --fc-stroke: var(--r-admin); }
.fc-error, .lg-error { --fc-fill: var(--delete-soft); --fc-stroke: var(--delete); }
.fc-end, .fc-ok, .lg-end { --fc-fill: var(--get-soft); --fc-stroke: var(--get); }
.fc-effect, .lg-effect { --fc-fill: var(--patch-soft); --fc-stroke: var(--patch); }
.fc-note, .lg-note { --fc-fill: var(--surface-2); --fc-stroke: var(--border); }
.fc-text-start { font-weight: 700; } .fc-text-end, .fc-text-ok { font-weight: 700; fill: var(--get); }
.fc-text-error { font-weight: 700; fill: var(--delete); } .fc-text-note { fill: var(--muted); }

@media (max-width: 900px) {
  #menu-toggle { display: inline-flex; }
  .search-wrap { max-width: none; }
  .logo small { display: none; }
  aside { position: fixed; z-index: 30; left: 0; top: 64px; width: 86vw; max-width: 320px; transform: translateX(-105%); transition: transform .2s; box-shadow: 0 0 40px rgba(15,23,42,.25); }
  aside.open { transform: none; }
  main { padding: 16px 16px 80px; }
  .hero { padding: 26px 20px 22px; border-radius: 16px; }
  .hero h1 { font-size: 26px; }
  .overview { padding: 4px 18px 16px; }
  .endpoint { padding: 16px 16px 6px; }
  .topbar { padding: 0 12px; gap: 8px; }
  .logo span.name { display: none; }
}
@media (max-width: 600px) {
  .stats { grid-template-columns: repeat(2, 1fr); }
  .stat:last-child { grid-column: span 2; }
}
`;


// ---------- behaviour (separate files: the server's Content-Security-Policy blocks inline scripts) ----------

/** Runs in <head> before the page is drawn, so the saved theme and language show without a flash. */
const initJs = `(function () {
  var root = document.documentElement, get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  if (get('prafi-docs-theme') === 'dark') root.setAttribute('data-theme', 'dark');
  // Language: ?lang=en|id in the link, then the saved choice, then the browser language
  var fromUrl = (location.search.match(/[?&]lang=(en|id)\\b/) || [])[1];
  var lang = fromUrl || get('prafi-docs-lang') || ((navigator.language || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en');
  root.setAttribute('data-lang', lang);
  root.setAttribute('lang', lang);
})();
`;

const js = `(function () {
  var root = document.documentElement;
  var set = function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} };
  var TEXT = {
    en: { light: '☀ Light', dark: '☾ Dark', copied: 'Copied', search: 'Search endpoints… press /' },
    id: { light: '☀ Terang', dark: '☾ Gelap', copied: 'Tersalin', search: 'Cari endpoint… tekan /' }
  };
  var lang = function () { return root.getAttribute('data-lang') === 'id' ? 'id' : 'en'; };
  var themeBtn = document.getElementById('theme-toggle');
  var search = document.getElementById('search');
  var refreshLabels = function () {
    var T = TEXT[lang()];
    themeBtn.textContent = root.getAttribute('data-theme') === 'dark' ? T.light : T.dark;
    search.setAttribute('placeholder', T.search);
    search.setAttribute('aria-label', T.search);
    document.querySelectorAll('.lang-switch button').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-set-lang') === lang())); });
  };
  refreshLabels();

  // Theme: light by default, remembered per browser
  themeBtn.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') !== 'dark';
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    set('prafi-docs-theme', dark ? 'dark' : 'light');
    refreshLabels();
  });

  // Language: English / Bahasa Indonesia, remembered per browser
  document.querySelectorAll('[data-set-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var l = b.getAttribute('data-set-lang');
      root.setAttribute('data-lang', l);
      root.setAttribute('lang', l);
      set('prafi-docs-lang', l);
      refreshLabels();
    });
  });

  // Base URL: when served by the backend, {{baseUrl}} is this server
  var base = /^https?:/.test(location.protocol) ? location.origin : 'http://localhost:4000';
  var baseEl = document.getElementById('base-url');
  if (baseEl) baseEl.textContent = base;
  document.querySelectorAll('[data-copy]').forEach(function (b) {
    b.setAttribute('data-copy', b.getAttribute('data-copy').split('{{baseUrl}}').join(base));
  });

  // Copy buttons
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.copy');
    if (!btn) return;
    var text = btn.id === 'copy-base' ? base : btn.getAttribute('data-copy');
    var done = function () {
      var old = btn.innerHTML;
      btn.textContent = TEXT[lang()].copied; btn.classList.add('done');
      setTimeout(function () { btn.innerHTML = old; btn.classList.remove('done'); }, 1200);
    };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () {});
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (err) {} t.remove(); }
  });

  // Search (matches English and Indonesian titles)
  var navItems = document.querySelectorAll('aside li[data-search]');
  var endpoints = document.querySelectorAll('article.endpoint');
  var navFolders = document.querySelectorAll('aside .nav-folder[data-folder]');
  var sections = document.querySelectorAll('section.folder');
  var intro = document.querySelectorAll('.hero, .overview, .flows');
  search.addEventListener('input', function () {
    var words = search.value.trim().toLowerCase().split(/\\s+/).filter(Boolean);
    var on = words.length > 0;
    var match = function (el) { var s = el.getAttribute('data-search'); return words.every(function (w) { return s.indexOf(w) !== -1; }); };
    navItems.forEach(function (li) { li.classList.toggle('hidden', on && !match(li)); });
    endpoints.forEach(function (a) { a.classList.toggle('hidden', on && !match(a)); });
    navFolders.forEach(function (f) { f.classList.toggle('hidden', on && !f.querySelector('li[data-search]:not(.hidden)')); });
    sections.forEach(function (s) { s.classList.toggle('hidden', on && !s.querySelector('article.endpoint:not(.hidden)')); });
    intro.forEach(function (el) { el.classList.toggle('hidden', on); });
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === '/' && document.activeElement !== search) { e.preventDefault(); search.focus(); }
    if (e.key === 'Escape' && document.activeElement === search) { search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
  });

  // Mobile menu
  var sidebar = document.getElementById('sidebar');
  document.getElementById('menu-toggle').addEventListener('click', function () { sidebar.classList.toggle('open'); });
  sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) sidebar.classList.remove('open'); });

  // Highlight the endpoint in view
  var links = {};
  document.querySelectorAll('aside li[data-search] a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var current = null;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var a = links[en.target.id];
        if (!a || a === current) return;
        if (current) current.classList.remove('active');
        current = a; a.classList.add('active');
        var r = a.getBoundingClientRect(), s = sidebar.getBoundingClientRect();
        if (r.top < s.top || r.bottom > s.bottom) a.scrollIntoView({ block: 'nearest' });
      });
    }, { rootMargin: '-80px 0px -65% 0px' });
    endpoints.forEach(function (el) { io.observe(el); });
  }

  // Back to top
  var top = document.getElementById('to-top');
  window.addEventListener('scroll', function () { top.classList.toggle('show', window.scrollY > 600); }, { passive: true });
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();
`;

/** Shows only the active language; English is the fallback before docs-init.js runs. */
const langCss = `
html:not([data-lang="id"]) [data-l="id"], html[data-lang="id"] [data-l="en"] { display: none !important; }
.lang-switch { display: inline-flex; border: 1px solid var(--border); border-radius: 10px; overflow: hidden; height: 40px; background: var(--surface); }
.lang-switch button { border: 0; background: none; color: var(--muted); font: inherit; font-size: 13px; font-weight: 700; padding: 0 12px; cursor: pointer; }
.lang-switch button + button { border-left: 1px solid var(--border); }
.lang-switch button[aria-pressed="true"] { background: var(--primary); color: #fff; }
`;

// ---------- page ----------

const html = `<!doctype html>
<html lang="en" data-lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)} Docs</title>
<meta name="description" content="${escapeHtml(title)} reference (English / Bahasa Indonesia): endpoints, roles, request bodies and realtime notifications.">
<script src="docs-init.js"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}${langCss}</style>
</head>
<body>
<header class="topbar">
  <button id="menu-toggle" class="icon-btn" type="button" aria-label="Menu">☰</button>
  <a class="logo" href="#top"><span class="logo-mark">P</span><span class="name">${escapeHtml(title)}</span><small>REST + Socket.IO</small></a>
  <label class="search-wrap">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
    <input id="search" type="search" placeholder="Search endpoints… press /" aria-label="Search endpoints">
  </label>
  <div class="lang-switch" role="group" aria-label="Language / Bahasa">
    <button type="button" data-set-lang="en" title="English">EN</button>
    <button type="button" data-set-lang="id" title="Bahasa Indonesia">ID</button>
  </div>
  <button id="theme-toggle" class="icon-btn" type="button">☾ Dark</button>
</header>
<div class="layout">
<aside id="sidebar">
  <ul>
    <li class="nav-folder"><a class="nav-folder-link" href="#top">${t(UI.overview)}</a></li>
    ${nav}
  </ul>
</aside>
<main id="top">
<div class="content">
  <section class="hero">
    <h1>${escapeHtml(title)}</h1>
    <p>${t(UI.hero)}</p>
    <div class="base-url"><span>${t(UI.baseUrl)}</span><code id="base-url">http://localhost:4000</code><button class="copy" id="copy-base" type="button">${t(UI.copy)}</button></div>
    <div class="stats">
      <div class="stat"><b>${requestCount}</b><span>${t(UI.endpoints)}</span></div>
      <div class="stat"><b>${folders.length}</b><span>${t(UI.groups)}</span></div>
      <div class="stat"><b>${ALL_ROLES.length}</b><span>${t(UI.roles)}</span></div>
      <div class="stat"><b>${methodCount('GET')} · ${methodCount('POST')} · ${methodCount('PATCH')} · ${methodCount('DELETE')}</b><span>${t(UI.methods)}</span></div>
    </div>
  </section>
  ${block(collection.info.description ?? '', id.overview, 'section', 'overview')}
  ${sections}
  <footer>${t({ en: UI.footer.en.replace('{date}', generatedAt), id: UI.footer.id.replace('{date}', generatedAt) })}</footer>
</div>
</main>
</div>
<button id="to-top" class="to-top" type="button" aria-label="Back to top">↑</button>
<script src="docs.js"></script>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
fs.writeFileSync(path.join(OUT_DIR, 'docs-init.js'), initJs);
fs.writeFileSync(path.join(OUT_DIR, 'docs.js'), js);
console.log(`documentation/: ${folders.length} groups, ${requestCount} endpoints, English + Bahasa Indonesia`);
if (missingFlows.length) {
  console.warn(`No flowchart yet, add to src/scripts/docs.flows.ts:\n  - ${missingFlows.join('\n  - ')}`);
}
// Indonesian sections whose folder/request no longer exists (e.g. a request was renamed in Postman)
const known = new Set(collection.item.flatMap((f) => [`FOLDER ${f.name}`, ...f.item.map((r) => `REQ ${r.name}`)]));
const orphaned = [...[...id.folders.keys()].map((k) => `FOLDER ${k}`), ...[...id.requests.keys()].map((k) => `REQ ${k}`)].filter((k) => !known.has(k));
if (orphaned.length) {
  console.warn(`In docs.id.md but not in the collection (renamed or removed? rename the section):\n  - ${orphaned.join('\n  - ')}`);
}
if (missing.length) {
  console.warn(`Not translated yet (shown in English), add to src/scripts/docs.id.md:\n  - ${missing.join('\n  - ')}`);
}
