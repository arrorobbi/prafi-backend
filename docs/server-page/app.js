// Server guide page (GET /api/docs/server): log in as superadmin, then load the guide from
// GET /api/docs/server/content with the token. The token is kept for this browser tab only (sessionStorage).
(function () {
  var KEY = 'prafi_server_docs_token';
  var $ = function (id) { return document.getElementById(id); };

  function getToken() { try { return sessionStorage.getItem(KEY); } catch (e) { return null; } }
  function setToken(t) { try { t ? sessionStorage.setItem(KEY, t) : sessionStorage.removeItem(KEY); } catch (e) { /* private mode */ } }

  function show(view) {
    $('login').classList.toggle('hidden', view !== 'login');
    $('guide').classList.toggle('hidden', view !== 'guide');
    $('logout').classList.toggle('hidden', view !== 'guide');
    $('who').classList.toggle('hidden', view !== 'guide');
  }

  function showError(message) {
    $('error').textContent = message;
    $('error').classList.toggle('hidden', !message);
  }

  function apiError(json, fallback) {
    return (json && json.error && json.error.message) || fallback;
  }

  function buildToc() {
    var toc = $('toc');
    toc.innerHTML = '<strong>Daftar isi</strong>';
    var headings = $('content').querySelectorAll('h3');
    headings.forEach(function (h, i) {
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
      btn.textContent = 'Salin';
      btn.addEventListener('click', function () {
        var text = pre.querySelector('code').textContent;
        navigator.clipboard.writeText(text).then(function () {
          btn.textContent = 'Tersalin';
          setTimeout(function () { btn.textContent = 'Salin'; }, 1500);
        });
      });
      pre.appendChild(btn);
    });
  }

  function loadGuide(token, email) {
    return fetch('/api/docs/server/content', { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
      .then(function (res) { return res.json().then(function (json) { return { res: res, json: json }; }); })
      .then(function (r) {
        if (!r.res.ok) {
          setToken(null);
          show('login');
          showError(r.res.status === 403 ? 'Akun ini bukan superadmin.' : apiError(r.json, 'Sesi berakhir, silakan masuk lagi.'));
          return;
        }
        // HTML from the server's own Markdown renderer (text is escaped there)
        $('content').innerHTML = r.json.data.html +
          '<p class="meta">Terakhir diperbarui: ' + new Date(r.json.data.updatedAt).toLocaleString('id-ID') + '</p>';
        buildToc();
        addCopyButtons();
        if (email) $('who').textContent = email;
        show('guide');
        if (location.hash) {
          var target = document.getElementById(location.hash.slice(1));
          if (target) target.scrollIntoView();
        }
      })
      .catch(function () {
        show('login');
        showError('Server tidak dapat dihubungi, coba lagi.');
      });
  }

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
        if (!r.res.ok) return showError(apiError(r.json, 'Login gagal.'));
        var data = r.json.data;
        if (!data.user || data.user.role !== 'superadmin') {
          // Not allowed here: end that session again right away
          fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + data.accessToken } });
          return showError('Panduan server hanya untuk akun superadmin.');
        }
        setToken(data.accessToken);
        try { sessionStorage.setItem(KEY + '_email', data.user.email); } catch (e) { /* ignore */ }
        $('password').value = '';
        return loadGuide(data.accessToken, data.user.email);
      })
      .catch(function () { showError('Server tidak dapat dihubungi, coba lagi.'); })
      .then(function () { $('submit').disabled = false; });
  });

  $('logout').addEventListener('click', function () {
    var token = getToken();
    setToken(null);
    $('content').innerHTML = '';
    show('login');
    if (token) fetch('/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
  });

  var saved = getToken();
  if (saved) {
    var email = null;
    try { email = sessionStorage.getItem(KEY + '_email'); } catch (e) { /* ignore */ }
    loadGuide(saved, email);
  } else {
    show('login');
  }
})();
