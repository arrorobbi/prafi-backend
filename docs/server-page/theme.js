// Loaded in <head>, before the page is drawn: applies the saved theme (light / dark) and language so the page
// doesn't flash the wrong one. Without a saved theme the browser's own setting decides (see the CSS).
(function () {
  try {
    var theme = localStorage.getItem('prafi_server_docs_theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.setAttribute('data-theme', theme);
    var lang = localStorage.getItem('prafi_server_docs_lang');
    if (lang !== 'en' && lang !== 'id') lang = /^en\b/i.test(navigator.language || '') ? 'en' : 'id';
    document.documentElement.lang = lang;
  } catch (e) { /* private mode: defaults */ }
})();
