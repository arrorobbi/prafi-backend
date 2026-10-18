// Server guide page (GET /api/docs/server): log in as superadmin, then load the guide from
// GET /api/docs/server/content?lang=… with the token. The token is kept for this browser tab only (sessionStorage).
// Opened from the website's superadmin dashboard (same domain through its /api proxy), the dashboard's own login
// (localStorage "prafi_token") is used instead, so there is no second login.
// Two languages (ID / EN) and two themes (light / dark); both choices are remembered in this browser.
(function () {
  var KEY = 'prafi_server_docs_token';
  var DASHBOARD_KEY = 'prafi_token';
  var LANG_KEY = 'prafi_server_docs_lang';
  var THEME_KEY = 'prafi_server_docs_theme';
  /** The token came from the dashboard: "Keluar" must not end that session */
  var shared = false;
  var view = 'login';
  var who = '';
  var $ = function (id) { return document.getElementById(id); };

  // ---------- language ----------
  var TEXT = {
    id: {
      title: 'Panduan Server · Trans Niaga', light: 'Terang', dark: 'Gelap', themeGroup: 'Tema',
      loginTitle: 'Masuk sebagai Superadmin', loginHint: 'Panduan server hanya dapat dibuka oleh akun superadmin.', signIn: 'Masuk',
      logout: 'Keluar', back: 'Kembali ke Dashboard', toc: 'Daftar isi', copy: 'Salin', copied: 'Tersalin',
      updated: 'Terakhir diperbarui: ', loading: 'Memuat panduan…',
      notSuperDashboard: 'Akun yang sedang login di dashboard bukan superadmin.', notSuper: 'Akun ini bukan superadmin.',
      onlySuper: 'Panduan server hanya untuk akun superadmin.', expired: 'Sesi berakhir, silakan masuk lagi.',
      offline: 'Server tidak dapat dihubungi, coba lagi.', loginFailed: 'Login gagal.', locale: 'id-ID', closePicture: 'Tutup gambar',
      print: 'Cetak', printSection: 'Cetak bagian', sections: ' bagian', printed: 'Dicetak ',
    },
    en: {
      title: 'Server Guide · Trans Niaga', light: 'Light', dark: 'Dark', themeGroup: 'Theme',
      loginTitle: 'Sign in as Superadmin', loginHint: 'Only a superadmin account can open the server guide.', signIn: 'Sign in',
      logout: 'Sign out', back: 'Back to Dashboard', toc: 'Contents', copy: 'Copy', copied: 'Copied',
      updated: 'Last updated: ', loading: 'Loading the guide…',
      notSuperDashboard: 'The account signed in on the dashboard is not a superadmin.', notSuper: 'This account is not a superadmin.',
      onlySuper: 'The server guide is for superadmin accounts only.', expired: 'The session has ended, please sign in again.',
      offline: 'The server cannot be reached, try again.', loginFailed: 'Sign-in failed.', locale: 'en-GB', closePicture: 'Close picture',
      print: 'Print', printSection: 'Print section', sections: ' sections', printed: 'Printed ',
    },
  };
  var lang = document.documentElement.lang === 'en' ? 'en' : 'id';
  function t(key) { return TEXT[lang][key]; }

  function applyLanguage() {
    document.documentElement.lang = lang;
    document.title = t('title');
    document.querySelectorAll('[data-i18n]').forEach(function (el) { el.textContent = t(el.getAttribute('data-i18n')); });
    document.querySelectorAll('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-lang') === lang)); });
    $('themes').setAttribute('aria-label', t('themeGroup'));
    $('toc').setAttribute('aria-label', t('toc'));
    $('logout').textContent = shared ? t('back') : t('logout');
  }

  // ---------- theme ----------
  function currentTheme() {
    var chosen = document.documentElement.getAttribute('data-theme');
    if (chosen === 'light' || chosen === 'dark') return chosen;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  function showTheme() {
    var now = currentTheme();
    document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-theme-choice') === now));
    });
  }
  document.querySelectorAll('[data-theme-choice]').forEach(function (b) {
    b.addEventListener('click', function () {
      var theme = b.getAttribute('data-theme-choice');
      document.documentElement.setAttribute('data-theme', theme);
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* private mode: this visit only */ }
      showTheme();
    });
  });
  // No saved choice: follow the browser when it changes
  if (window.matchMedia) {
    var media = window.matchMedia('(prefers-color-scheme: dark)');
    if (media.addEventListener) media.addEventListener('change', showTheme);
  }

  // ---------- session ----------
  function getToken() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function setToken(v) { try { v ? sessionStorage.setItem(KEY, v) : sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  function show(next) {
    view = next;
    $('login').classList.toggle('hidden', view !== 'login');
    $('guide').classList.toggle('hidden', view !== 'guide');
    $('logout').classList.toggle('hidden', view !== 'guide');
    $('logout').textContent = shared ? t('back') : t('logout');
    $('who').classList.toggle('hidden', view !== 'guide' || !who);
    $('print').classList.toggle('hidden', view !== 'guide');
  }

  function showError(message) {
    $('error').textContent = message;
    $('error').classList.toggle('hidden', !message);
  }

  function apiError(json, fallback) {
    return (json && json.error && json.error.message) || fallback;
  }

  // ---------- the guide ----------
  // ---------- the guide's layout: banner, one card per section, contents with numbers ----------

  /** "12. Backend (Express): …" → { num: "12", title: "Backend (Express): …" } */
  function splitNumber(text) {
    var m = /^(\d+)\.\s+(.*)$/.exec(text.trim());
    return m ? { num: m[1], title: m[2] } : { num: '', title: text.trim() };
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  /**
   * Turns the rendered Markdown into the page: the title and first paragraph become the banner, the remaining
   * introduction a note box, and every ## section (h3 here) a card with its number and a "print this section" button.
   */
  function arrange(updatedAt) {
    var content = $('content');
    var nodes = Array.prototype.slice.call(content.children);
    var titleEl = nodes[0] && nodes[0].tagName === 'H2' ? nodes.shift() : null;
    var intro = [];
    while (nodes.length && nodes[0].tagName !== 'H3') intro.push(nodes.shift());
    var meta = nodes.length && nodes[nodes.length - 1].classList.contains('meta') ? nodes.pop() : null;

    var sections = [];
    nodes.forEach(function (n) {
      if (n.tagName === 'H3' || !sections.length) sections.push({ head: n.tagName === 'H3' ? n : null, body: [] });
      if (n.tagName !== 'H3') sections[sections.length - 1].body.push(n);
    });

    var frag = document.createDocumentFragment();
    var printTitle = el('p', 'print-title', t('title') + ' · ' + t('printed') + new Date().toLocaleString(t('locale')));
    frag.appendChild(printTitle);

    var hero = el('div', 'hero');
    hero.appendChild(el('h2', '', titleEl ? titleEl.textContent : t('title')));
    var firstP = intro.length && intro[0].tagName === 'P' ? intro.shift() : null;
    if (firstP) hero.appendChild(el('p', '', firstP.textContent));
    var chips = el('div', 'chips');
    chips.appendChild(el('span', 'chip', sections.length + t('sections')));
    chips.appendChild(el('span', 'chip', t('updated') + new Date(updatedAt).toLocaleDateString(t('locale'), { day: 'numeric', month: 'long', year: 'numeric' })));
    var heroPrint = el('button', '', t('print'));
    heroPrint.type = 'button';
    heroPrint.addEventListener('click', function () { printGuide(null); });
    chips.appendChild(heroPrint);
    hero.appendChild(chips);
    frag.appendChild(hero);

    if (intro.length) {
      var note = el('div', 'note');
      intro.forEach(function (n) { note.appendChild(n); });
      frag.appendChild(note);
    }

    sections.forEach(function (sec, i) {
      var box = el('section', 'sec');
      if (sec.head) {
        var parts = splitNumber(sec.head.textContent);
        var head = el('div', 'sec-head');
        head.appendChild(el('span', 'num', parts.num || String(i + 1)));
        // Section ids don't depend on the language, so a link keeps working after switching
        var h3 = el('h3', '', parts.title);
        h3.id = 'bagian-' + (i + 1);
        head.appendChild(h3);
        var btn = el('button', 'print-one', t('printSection'));
        btn.type = 'button';
        btn.addEventListener('click', function () { printGuide(box); });
        head.appendChild(btn);
        box.appendChild(head);
        box.setAttribute('data-title', parts.title);
        box.setAttribute('data-num', parts.num || String(i + 1));
      }
      sec.body.forEach(function (n) { box.appendChild(n); });
      frag.appendChild(box);
    });
    if (meta) frag.appendChild(meta);

    content.innerHTML = '';
    content.appendChild(frag);
  }

  function buildToc() {
    var toc = $('toc');
    toc.innerHTML = '';
    toc.appendChild(el('strong', '', t('toc')));
    $('content').querySelectorAll('section.sec').forEach(function (sec) {
      var h3 = sec.querySelector('h3');
      if (!h3) return;
      var a = el('a');
      a.href = '#' + h3.id;
      a.appendChild(el('span', 'n', sec.getAttribute('data-num')));
      a.appendChild(el('span', '', sec.getAttribute('data-title')));
      toc.appendChild(a);
    });
    followReading();
  }

  // ---------- where the reader is: the contents' highlight and the line under the top bar ----------
  var spy = null;
  function followReading() {
    if (spy) spy.disconnect();
    var links = {};
    $('toc').querySelectorAll('a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    if (!('IntersectionObserver' in window)) return;
    spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var h3 = en.target.querySelector('h3');
        var a = h3 && links[h3.id];
        if (!a) return;
        $('toc').querySelectorAll('a.active').forEach(function (x) { x.classList.remove('active'); });
        a.classList.add('active');
        var toc = $('toc');
        var r = a.getBoundingClientRect(), s2 = toc.getBoundingClientRect();
        if (r.top < s2.top + 40) toc.scrollTop -= s2.top + 40 - r.top;
        else if (r.bottom > s2.bottom - 10) toc.scrollTop += r.bottom - (s2.bottom - 10);
      });
    }, { rootMargin: '-100px 0px -60% 0px' });
    $('content').querySelectorAll('section.sec').forEach(function (sec) { spy.observe(sec); });
  }
  window.addEventListener('scroll', function () {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    $('progress').style.width = (max > 0 ? Math.min(100, (window.scrollY / max) * 100) : 0) + '%';
  }, { passive: true });

  // ---------- printing ----------
  /** Pictures load only when scrolled to; before printing they must all be there */
  function loadAllPictures(scope) {
    var imgs = Array.prototype.slice.call((scope || $('content')).querySelectorAll('img'));
    return Promise.race([
      Promise.all(imgs.map(function (img) {
        img.loading = 'eager';
        if (img.complete && img.naturalWidth) return null;
        return new Promise(function (resolve) { img.addEventListener('load', resolve, { once: true }); img.addEventListener('error', resolve, { once: true }); });
      })),
      new Promise(function (resolve) { setTimeout(resolve, 8000); }),
    ]);
  }
  /** `section`: print only that card; null: the whole guide */
  function printGuide(section) {
    if (section) {
      document.body.classList.add('print-one-section');
      section.classList.add('print-target');
    }
    var cleanUp = function () {
      document.body.classList.remove('print-one-section');
      if (section) section.classList.remove('print-target');
      window.removeEventListener('afterprint', cleanUp);
    };
    window.addEventListener('afterprint', cleanUp);
    loadAllPictures(section).then(function () { window.print(); });
  }
  $('print').addEventListener('click', function () { printGuide(null); });
  // Ctrl+P / the browser's own Print: start loading the pictures (most will make it into the print)
  window.addEventListener('beforeprint', function () {
    $('content').querySelectorAll('img').forEach(function (img) { img.loading = 'eager'; });
  });

  function addCopyButtons() {
    $('content').querySelectorAll('pre').forEach(function (pre) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy';
      btn.textContent = t('copy');
      btn.addEventListener('click', function () {
        var text = pre.querySelector('code').textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = t('copied');
          setTimeout(function () { btn.textContent = t('copy'); }, 1500);
        });
      });
      pre.appendChild(btn);
    });
  }

  // ---------- pictures: a click opens them larger on this page, not in a new tab ----------
  var zoomed = null;
  function closeZoom() {
    if (!zoomed) return;
    document.body.removeChild(zoomed.box);
    document.removeEventListener('keydown', zoomed.onKey);
    if (zoomed.from) zoomed.from.focus();
    zoomed = null;
  }
  function openZoom(link) {
    closeZoom();
    var img = link.querySelector('img');
    var box = document.createElement('div');
    box.className = 'zoom';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', img.alt || 'Gambar');
    var big = document.createElement('img');
    big.src = link.href;
    big.alt = img.alt;
    var close = document.createElement('button');
    close.type = 'button';
    close.className = 'zoom-close';
    close.setAttribute('aria-label', t('closePicture'));
    close.textContent = '\u00d7';
    box.appendChild(big);
    if (img.alt) {
      var caption = document.createElement('p');
      caption.textContent = img.alt;
      box.appendChild(caption);
    }
    box.appendChild(close);
    // A click beside the picture, the button or Esc closes it
    box.addEventListener('click', function (ev) { if (ev.target !== big) closeZoom(); });
    var onKey = function (ev) { if (ev.key === 'Escape') closeZoom(); };
    document.addEventListener('keydown', onKey);
    document.body.appendChild(box);
    zoomed = { box: box, onKey: onKey, from: link };
    close.focus();
  }
  $('content').addEventListener('click', function (ev) {
    var link = ev.target.closest ? ev.target.closest('figure a') : null;
    // Ctrl / middle click still opens a new tab, as with any link
    if (!link || ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    openZoom(link);
  });

  /** `keepPlace`: after a language switch, stay at the section being read */
  function loadGuide(token, keepPlace) {
    var place = keepPlace ? currentSection() : null;
    return fetch('/api/docs/server/content?lang=' + lang, { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (res) { return res.json().then(function (json) { return { res: res, json: json }; }); })
      .then(function (r) {
        if (!r.res.ok) {
          if (shared) {
            // The dashboard login isn't a (valid) superadmin session: ask for a login here, leave the dashboard alone
            shared = false;
            show('login');
            if (r.res.status === 403) showError(t('notSuperDashboard'));
            return;
          }
          setToken(null);
          show('login');
          showError(r.res.status === 403 ? t('notSuper') : apiError(r.json, t('expired')));
          return;
        }
        // HTML from the server's own Markdown renderer (text is escaped there)
        $('content').innerHTML = r.json.data.html +
          '<p class="meta">' + t('updated') + new Date(r.json.data.updatedAt).toLocaleString(t('locale')) + '</p>';
        arrange(r.json.data.updatedAt);
        buildToc();
        addCopyButtons();
        show('guide');
        var target = document.getElementById(place || location.hash.slice(1));
        if (target) target.scrollIntoView();
      })
      .catch(function () {
        show('login');
        showError(t('offline'));
      });
  }

  /** The id of the section heading nearest above the top of the window */
  function currentSection() {
    var found = null;
    $('content').querySelectorAll('h3').forEach(function (h) {
      if (h.getBoundingClientRect().top < 120) found = h.id;
    });
    return found;
  }

  function activeToken() {
    if (shared) { try { return localStorage.getItem(DASHBOARD_KEY); } catch (e) { return null; } }
    return getToken();
  }

  document.querySelectorAll('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var next = b.getAttribute('data-lang');
      if (next === lang) return;
      lang = next;
      try { localStorage.setItem(LANG_KEY, lang); } catch (e) { /* private mode: this visit only */ }
      applyLanguage();
      showError('');
      var token = activeToken();
      if (view === 'guide' && token) loadGuide(token, true);
    });
  });

  $('login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    showError('');
    $('submit').disabled = true;
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: $('email').value, password: $('password').value }),
    })
      .then(function (res) { return res.json().then(function (json) { return { res: res, json: json }; }); })
      .then(function (r) {
        if (!r.res.ok) return showError(apiError(r.json, t('loginFailed')));
        var data = r.json.data;
        if (!data.user || data.user.role !== 'superadmin') {
          // Not allowed here: end that session again right away
          fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + data.accessToken } });
          return showError(t('onlySuper'));
        }
        setToken(data.accessToken);
        try { sessionStorage.setItem(KEY + '_email', data.user.email); } catch (e) { /* ignore */ }
        $('password').value = '';
        who = data.user.email;
        $('who').textContent = who;
        return loadGuide(data.accessToken);
      })
      .catch(function () { showError(t('offline')); })
      .then(function () { $('submit').disabled = false; });
  });

  $('logout').addEventListener('click', function () {
    if (shared) {
      location.href = '/superadmin';
      return;
    }
    var token = getToken();
    setToken(null);
    $('content').innerHTML = '';
    who = '';
    show('login');
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  });

  applyLanguage();
  showTheme();

  var saved = getToken();
  var dashboard = null;
  try { dashboard = localStorage.getItem(DASHBOARD_KEY); } catch (e) { /* ignore */ }
  if (saved) {
    try { who = sessionStorage.getItem(KEY + '_email') || ''; } catch (e) { /* ignore */ }
    $('who').textContent = who;
    loadGuide(saved);
  } else if (dashboard) {
    shared = true;
    loadGuide(dashboard);
    fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + dashboard } })
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (json) {
        if (!json || !json.data) return;
        who = json.data.email;
        $('who').textContent = who;
        $('who').classList.toggle('hidden', view !== 'guide');
      })
      .catch(function () { /* the email is only a label */ });
  } else {
    show('login');
  }
})();
