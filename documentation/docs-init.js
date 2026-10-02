(function () {
  var root = document.documentElement, get = function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } };
  if (get('prafi-docs-theme') === 'dark') root.setAttribute('data-theme', 'dark');
  // Language: ?lang=en|id in the link, then the saved choice, then the browser language
  var fromUrl = (location.search.match(/[?&]lang=(en|id)\b/) || [])[1];
  var lang = fromUrl || get('prafi-docs-lang') || ((navigator.language || '').toLowerCase().indexOf('id') === 0 ? 'id' : 'en');
  root.setAttribute('data-lang', lang);
  root.setAttribute('lang', lang);
})();
