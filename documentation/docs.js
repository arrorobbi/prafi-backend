(function () {
  var root = document.documentElement;
  // Theme: light by default, remembered per browser
  var stored = null;
  try { stored = localStorage.getItem('prafi-docs-theme'); } catch (e) {}
  if (stored === 'dark') root.setAttribute('data-theme', 'dark');
  var themeBtn = document.getElementById('theme-toggle');
  var setThemeLabel = function () { themeBtn.textContent = root.getAttribute('data-theme') === 'dark' ? '☀ Light' : '☾ Dark'; };
  setThemeLabel();
  themeBtn.addEventListener('click', function () {
    var dark = root.getAttribute('data-theme') !== 'dark';
    if (dark) root.setAttribute('data-theme', 'dark'); else root.removeAttribute('data-theme');
    try { localStorage.setItem('prafi-docs-theme', dark ? 'dark' : 'light'); } catch (e) {}
    setThemeLabel();
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
    var done = function () { var old = btn.textContent; btn.textContent = 'Copied'; btn.classList.add('done'); setTimeout(function () { btn.textContent = old; btn.classList.remove('done'); }, 1200); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, function () {});
    else { var t = document.createElement('textarea'); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); done(); } catch (err) {} t.remove(); }
  });

  // Search
  var search = document.getElementById('search');
  var navItems = document.querySelectorAll('aside li[data-search]');
  var endpoints = document.querySelectorAll('article.endpoint');
  var navFolders = document.querySelectorAll('aside .nav-folder[data-folder]');
  var sections = document.querySelectorAll('section.folder');
  var intro = document.querySelectorAll('.hero, .overview');
  search.addEventListener('input', function () {
    var words = search.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
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
