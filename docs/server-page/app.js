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
      offline: 'Server tidak dapat dihubungi, coba lagi.', loginFailed: 'Login gagal.', locale: 'id-ID',
    },
    en: {
      title: 'Server Guide · Trans Niaga', light: 'Light', dark: 'Dark', themeGroup: 'Theme',
      loginTitle: 'Sign in as Superadmin', loginHint: 'Only a superadmin account can open the server guide.', signIn: 'Sign in',
      logout: 'Sign out', back: 'Back to Dashboard', toc: 'Contents', copy: 'Copy', copied: 'Copied',
      updated: 'Last updated: ', loading: 'Loading the guide…',
      notSuperDashboard: 'The account signed in on the dashboard is not a superadmin.', notSuper: 'This account is not a superadmin.',
      onlySuper: 'The server guide is for superadmin accounts only.', expired: 'The session has ended, please sign in again.',
      offline: 'The server cannot be reached, try again.', loginFailed: 'Sign-in failed.', locale: 'en-GB',
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
  }

  function showError(message) {
    $('error').textContent = message;
    $('error').classList.toggle('hidden', !message);
  }

  function apiError(json, fallback) {
    return (json && json.error && json.error.message) || fallback;
  }

  // ---------- the guide ----------
  function buildToc() {
    var toc = $('toc');
    toc.innerHTML = '';
    var label = document.createElement('strong');
    label.textContent = t('toc');
    toc.appendChild(label);
    // Section ids don't depend on the language, so a link keeps working after switching
    $('content').querySelectorAll('h3').forEach(function (h, i) {
      h.id = 'bagian-' + (i + 1);
      var a = document.createElement('a');
      a.href = '#' + h.id;
      a.textContent = h.textContent;
      toc.appendChild(a);
    });
  }

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
