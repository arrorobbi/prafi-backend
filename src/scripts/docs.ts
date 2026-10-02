/**
 * Builds documentation/index.html from the Postman collection, so the docs always match it.
 * Run: npm run docs   (then open documentation/index.html in a browser; no server needed)
 */
import fs from 'node:fs';
import path from 'node:path';

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

// ---------- page ----------

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const splitName = (name: string) => {
  const m = name.match(/^(.*?)\s*\(([^)]*)\)$/);
  return m ? { title: m[1], access: m[2] } : { title: name, access: '' };
};
const urlOf = (u: PmUrl | string) => (typeof u === 'string' ? u : u.raw ?? '');
const pathOf = (u: PmUrl | string) => urlOf(u).replace('{{baseUrl}}', '').split('?')[0] || urlOf(u);

function accessBadges(access: string) {
  if (!access) return '';
  return access
    .split(',')
    .map((a) => a.trim())
    .map((a) => `<span class="badge role role-${slug(a)}">${escapeHtml(a)}</span>`)
    .join('');
}

function requestBlock(folder: PmFolder, r: PmRequest) {
  const { title, access } = splitName(r.name);
  const id = `${slug(folder.name)}--${slug(title)}`;
  const method = r.request.method.toUpperCase();
  const url = urlOf(r.request.url);
  const query = typeof r.request.url === 'string' ? [] : r.request.url.query ?? [];
  const desc = (r.request.description ?? '').replace(/^\*\*Access:\*\*[^\n]*\n*/, '');
  const isPublic = r.request.auth?.type === 'noauth';

  let body = '';
  if (r.request.body?.mode === 'raw' && r.request.body.raw) {
    body = `<h4>Body <span class="muted">application/json</span></h4><pre><code class="lang-json">${escapeHtml(r.request.body.raw)}</code></pre>`;
  } else if (r.request.body?.mode === 'formdata') {
    body =
      '<h4>Body <span class="muted">multipart/form-data</span></h4><div class="table-wrap"><table><thead><tr><th>field</th><th>type</th><th>example</th></tr></thead><tbody>' +
      (r.request.body.formdata ?? [])
        .map((f) => `<tr><td><code>${escapeHtml(f.key)}</code></td><td>${escapeHtml(f.type ?? 'text')}</td><td>${escapeHtml(f.value ?? f.src ?? '')}</td></tr>`)
        .join('') +
      '</tbody></table></div>';
  }
  const params = query.length
    ? '<h4>Query parameters</h4><div class="table-wrap"><table><thead><tr><th>name</th><th>example</th><th></th></tr></thead><tbody>' +
      query.map((q) => `<tr><td><code>${escapeHtml(q.key)}</code></td><td><code>${escapeHtml(q.value)}</code></td><td>${q.disabled ? 'optional' : ''}</td></tr>`).join('') +
      '</tbody></table></div>'
    : '';

  return `
<article class="endpoint" id="${id}" data-search="${escapeHtml(`${folder.name} ${r.name} ${method} ${url}`.toLowerCase())}">
  <div class="endpoint-head">
    <h3><a href="#${id}">${escapeHtml(title)}</a></h3>
    <div class="badges">${accessBadges(access)}</div>
  </div>
  <div class="url"><span class="method m-${method.toLowerCase()}">${method}</span><code>${escapeHtml(url)}</code></div>
  <p class="auth">${isPublic ? 'No authentication' : 'Authorization: <code>Bearer {{token}}</code>'}</p>
  ${markdown(desc)}
  ${params}
  ${body}
</article>`;
}

const folders = collection.item;
const nav = folders
  .map(
    (f) => `
  <li class="nav-folder" data-folder="${slug(f.name)}">
    <a class="nav-folder-link" href="#${slug(f.name)}">${escapeHtml(f.name)}</a>
    <ul>${f.item
      .map((r) => {
        const { title } = splitName(r.name);
        const m = r.request.method.toUpperCase();
        return `<li data-search="${escapeHtml(`${f.name} ${r.name} ${m} ${urlOf(r.request.url)}`.toLowerCase())}"><a href="#${slug(f.name)}--${slug(title)}"><span class="nav-method m-${m.toLowerCase()}">${m === 'DELETE' ? 'DEL' : m}</span>${escapeHtml(title)}</a></li>`;
      })
      .join('')}</ul>
  </li>`,
  )
  .join('');

const sections = folders
  .map(
    (f) => `
<section class="folder" id="${slug(f.name)}">
  <h2>${escapeHtml(f.name)}</h2>
  <div class="folder-desc">${markdown(f.description ?? '')}</div>
  ${f.item.map((r) => requestBlock(f, r)).join('\n')}
</section>`,
  )
  .join('\n');

const requestCount = folders.reduce((n, f) => n + f.item.length, 0);
const generatedAt = new Date().toISOString().slice(0, 10);

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(collection.info.name)} Documentation</title>
<style>
:root {
  --bg: #ffffff; --bg-soft: #f6f7f9; --bg-code: #f3f4f6; --text: #1f2328; --muted: #656d76; --border: #d8dee4;
  --accent: #0b6bcb; --sidebar: #fafbfc;
  --get: #0f7b3f; --post: #a15c00; --patch: #6b3fa0; --put: #1d5fa8; --delete: #b42318;
  --role-public: #e7f5ec; --role-public-t: #0f7b3f; --role-all: #e8f1fb; --role-all-t: #0b5cad;
  --role-superadmin: #fdecec; --role-superadmin-t: #a8201a; --role-admin: #fff3e0; --role-admin-t: #9a5200;
  --role-tenant: #f1ecfb; --role-tenant-t: #5b3a97;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f1216; --bg-soft: #161b22; --bg-code: #1b2129; --text: #e6edf3; --muted: #8d96a0; --border: #2d333b;
    --accent: #58a6ff; --sidebar: #12161c;
    --get: #3fb950; --post: #e3a03b; --patch: #b48ef0; --put: #6cb6ff; --delete: #f47067;
    --role-public: #12301d; --role-public-t: #56d37f; --role-all: #10253d; --role-all-t: #6cb6ff;
    --role-superadmin: #3a1614; --role-superadmin-t: #ff8a80; --role-admin: #3a2810; --role-admin-t: #f0b360;
    --role-tenant: #261c3d; --role-tenant-t: #c3a6ff;
  }
}
* { box-sizing: border-box; }
html { scroll-padding-top: 16px; }
body { margin: 0; background: var(--bg); color: var(--text); font: 15px/1.6 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
code { font-family: ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace; font-size: .88em; background: var(--bg-code); padding: .1em .35em; border-radius: 4px; overflow-wrap: break-word; }
pre { background: var(--bg-code); border: 1px solid var(--border); border-radius: 8px; padding: 12px 14px; overflow-x: auto; }
pre code { background: none; padding: 0; font-size: .85em; overflow-wrap: normal; }
.layout { display: flex; min-height: 100vh; }
aside { width: 290px; flex-shrink: 0; background: var(--sidebar); border-right: 1px solid var(--border); position: sticky; top: 0; height: 100vh; overflow-y: auto; padding: 18px 14px 40px; }
aside .brand { font-weight: 700; font-size: 18px; margin: 0 6px 4px; }
aside .meta { color: var(--muted); font-size: 12px; margin: 0 6px 12px; }
#search { width: 100%; padding: 8px 10px; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); color: var(--text); font-size: 14px; margin-bottom: 10px; }
aside ul { list-style: none; margin: 0; padding: 0; }
.nav-folder { margin: 8px 0; }
.nav-folder-link { display: block; font-weight: 600; color: var(--text); padding: 3px 6px; border-radius: 4px; }
.nav-folder ul li a { display: flex; gap: 6px; align-items: baseline; padding: 2px 6px 2px 10px; color: var(--muted); font-size: 13.5px; border-radius: 4px; }
.nav-folder ul li a:hover, .nav-folder-link:hover { background: var(--bg-code); text-decoration: none; color: var(--text); }
.nav-method { font: 600 10px/1 ui-monospace, Consolas, monospace; width: 34px; flex-shrink: 0; }
main { flex: 1; min-width: 0; padding: 28px 40px 80px; max-width: 980px; }
h1 { font-size: 30px; margin: 0 0 4px; }
h2 { font-size: 23px; margin: 48px 0 8px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
h3 { font-size: 17px; margin: 0; }
h4 { font-size: 14px; margin: 16px 0 6px; }
.overview h3 { font-size: 18px; margin: 26px 0 8px; }
.muted { color: var(--muted); font-weight: 400; }
.table-wrap { overflow-x: auto; }
table { border-collapse: collapse; margin: 10px 0; font-size: 14px; min-width: 50%; }
th, td { border: 1px solid var(--border); padding: 6px 10px; text-align: left; vertical-align: top; }
th { background: var(--bg-soft); }
blockquote { margin: 12px 0; padding: 4px 14px; border-left: 4px solid var(--accent); background: var(--bg-soft); border-radius: 0 6px 6px 0; }
.endpoint { border: 1px solid var(--border); border-radius: 10px; padding: 16px 18px; margin: 18px 0; background: var(--bg); }
.endpoint:target { outline: 2px solid var(--accent); }
.endpoint-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; }
.endpoint-head h3 a { color: var(--text); }
.url { display: flex; align-items: center; gap: 10px; margin: 10px 0 4px; background: var(--bg-soft); border: 1px solid var(--border); border-radius: 6px; padding: 6px 10px; flex-wrap: wrap; }
.url code { background: none; padding: 0; font-size: 14px; }
.method { font: 700 12px/1 ui-monospace, Consolas, monospace; padding: 4px 7px; border-radius: 4px; color: #fff; }
.m-get { background: var(--get); } .m-post { background: var(--post); } .m-patch { background: var(--patch); } .m-put { background: var(--put); } .m-delete { background: var(--delete); }
.nav-method.m-get, .nav-method.m-post, .nav-method.m-patch, .nav-method.m-put, .nav-method.m-delete { background: none; }
.nav-method.m-get { color: var(--get); } .nav-method.m-post { color: var(--post); } .nav-method.m-patch { color: var(--patch); } .nav-method.m-delete { color: var(--delete); }
.auth { color: var(--muted); font-size: 13px; margin: 4px 0 10px; }
.badges { display: flex; gap: 6px; flex-wrap: wrap; }
.badge { font-size: 12px; font-weight: 600; padding: 2px 9px; border-radius: 999px; }
.role-public { background: var(--role-public); color: var(--role-public-t); }
.role-all-roles { background: var(--role-all); color: var(--role-all-t); }
.role-superadmin { background: var(--role-superadmin); color: var(--role-superadmin-t); }
.role-admin { background: var(--role-admin); color: var(--role-admin-t); }
.role-tenant { background: var(--role-tenant); color: var(--role-tenant-t); }
.hidden { display: none !important; }
#menu-toggle { display: none; }
@media (max-width: 860px) {
  .layout { display: block; }
  aside { position: fixed; z-index: 10; left: 0; top: 0; width: 86vw; max-width: 320px; transform: translateX(-100%); transition: transform .2s; box-shadow: 0 0 24px rgba(0,0,0,.25); }
  aside.open { transform: none; }
  #menu-toggle { display: inline-block; position: sticky; top: 0; z-index: 5; margin: 0; width: 100%; padding: 10px 16px; border: 0; border-bottom: 1px solid var(--border); background: var(--sidebar); color: var(--text); text-align: left; font-size: 15px; }
  main { padding: 16px 16px 60px; }
}
</style>
</head>
<body>
<button id="menu-toggle" type="button">☰ Endpoints</button>
<div class="layout">
<aside id="sidebar">
  <div class="brand">${escapeHtml(collection.info.name)}</div>
  <div class="meta">${folders.length} groups · ${requestCount} endpoints · generated ${generatedAt}</div>
  <input id="search" type="search" placeholder="Search endpoints… (e.g. product, PATCH, tenant)">
  <ul>
    <li class="nav-folder"><a class="nav-folder-link" href="#overview">Overview</a></li>
    ${nav}
  </ul>
</aside>
<main>
  <section class="overview" id="overview">
    <h1>${escapeHtml(collection.info.name)}</h1>
    <p class="muted">Generated from <code>postman/Prafi-API.postman_collection.json</code> on ${generatedAt}. Regenerate with <code>npm run docs</code>.</p>
    ${markdown(collection.info.description ?? '').replace(/<h3>/g, '<h3>').replace(/<\/h3>/g, '</h3>')}
  </section>
  ${sections}
</main>
</div>
<script>
(function () {
  var search = document.getElementById('search');
  var navItems = document.querySelectorAll('aside li[data-search]');
  var endpoints = document.querySelectorAll('article.endpoint');
  var folders = document.querySelectorAll('aside .nav-folder[data-folder]');
  var sections = document.querySelectorAll('section.folder');
  search.addEventListener('input', function () {
    var q = search.value.trim().toLowerCase();
    var words = q.split(/\\s+/).filter(Boolean);
    var match = function (el) { var s = el.getAttribute('data-search'); return words.every(function (w) { return s.indexOf(w) !== -1; }); };
    navItems.forEach(function (li) { li.classList.toggle('hidden', !!q && !match(li)); });
    endpoints.forEach(function (a) { a.classList.toggle('hidden', !!q && !match(a)); });
    folders.forEach(function (f) { f.classList.toggle('hidden', !!q && !f.querySelector('li[data-search]:not(.hidden)')); });
    sections.forEach(function (s) { s.classList.toggle('hidden', !!q && !s.querySelector('article.endpoint:not(.hidden)')); });
    document.getElementById('overview').classList.toggle('hidden', !!q);
  });
  var sidebar = document.getElementById('sidebar');
  document.getElementById('menu-toggle').addEventListener('click', function () { sidebar.classList.toggle('open'); });
  sidebar.addEventListener('click', function (e) { if (e.target.closest('a')) sidebar.classList.remove('open'); });
})();
</script>
</body>
</html>
`;

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(path.join(OUT_DIR, 'index.html'), html);
console.log(`documentation/index.html: ${folders.length} groups, ${requestCount} endpoints`);
