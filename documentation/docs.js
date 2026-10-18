(function () {
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

  // Highlight the endpoint in view
  var links = {};
  document.querySelectorAll('aside li[data-search] a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
  var current = null;
  /** True while the page is being scrolled to a clicked link: the highlight then doesn't move the sidebar */
  var jumping = false, jumpTimer = null;
  var setActive = function (a) {
    if (!a || a === current) return;
    if (current) current.classList.remove('active');
    current = a; a.classList.add('active');
  };
  // Keeps the highlighted link visible by scrolling the sidebar only. (scrollIntoView would scroll the page too,
  // which cut a click on a link low in the sidebar short: the page stopped before reaching the endpoint.)
  var keepVisible = function (a) {
    var r = a.getBoundingClientRect(), s = sidebar.getBoundingClientRect();
    if (r.top < s.top + 8) sidebar.scrollTop -= s.top + 8 - r.top;
    else if (r.bottom > s.bottom - 8) sidebar.scrollTop += r.bottom - (s.bottom - 8);
  };
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      if (jumping) return;
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var a = links[en.target.id];
        if (!a || a === current) return;
        setActive(a);
        keepVisible(a);
      });
    }, { rootMargin: '-80px 0px -65% 0px' });
    endpoints.forEach(function (el) { io.observe(el); });
  }

  // A click on a sidebar link: scroll the page to that section, below the sticky header, wherever the link is
  var header = document.querySelector('header');
  var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  sidebar.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="#"]');
    if (!a) return;
    sidebar.classList.remove('open');
    var id = decodeURIComponent(a.getAttribute('href').slice(1));
    var target = id === 'top' ? null : document.getElementById(id);
    if (id !== 'top' && !target) return;
    e.preventDefault();
    var offset = (header ? header.getBoundingClientRect().height : 64) + 12;
    var y = target ? target.getBoundingClientRect().top + window.scrollY - offset : 0;
    jumping = true;
    clearTimeout(jumpTimer);
    window.scrollTo({ top: Math.max(0, y), behavior: reduceMotion ? 'auto' : 'smooth' });
    history.replaceState(null, '', '#' + id);
    if (links[id]) setActive(links[id]);
    // Highlighting follows the page again once the scroll has ended
    var done = function () { jumping = false; window.removeEventListener('scrollend', done); };
    window.addEventListener('scrollend', done);
    jumpTimer = setTimeout(done, 1200);
  });

  // Back to top
  var top = document.getElementById('to-top');
  window.addEventListener('scroll', function () { top.classList.toggle('show', window.scrollY > 600); }, { passive: true });
  top.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
})();
