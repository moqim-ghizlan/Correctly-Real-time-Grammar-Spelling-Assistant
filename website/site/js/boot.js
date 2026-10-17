// Classic script run in <head>, before first paint: applies the stored or
// system theme (no flash), flags JavaScript and motion, and picks the
// language. A non-French choice hides the page until main.js applies it,
// capped at 1.5 s so the page never stays hidden if a module fails.
(function () {
  var root = document.documentElement;
  var read = function (key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };
  var media = function (query) {
    return Boolean(window.matchMedia && window.matchMedia(query).matches);
  };

  var pref = read('correctly-site.theme');
  if (pref !== 'light' && pref !== 'dark') pref = 'system';
  var dark =
    pref === 'dark' ||
    (pref === 'system' && media('(prefers-color-scheme: dark)'));
  root.setAttribute('data-theme-pref', pref);
  root.setAttribute('data-theme', dark ? 'dark' : 'light');

  root.classList.add('js');
  if (!media('(prefers-reduced-motion: reduce)')) root.classList.add('motion');

  var lang = read('correctly-site.lang');
  if (lang !== 'fr' && lang !== 'en') {
    var list = navigator.languages || [navigator.language || ''];
    lang = 'fr';
    for (var i = 0; i < list.length; i++) {
      var code = String(list[i]).slice(0, 2).toLowerCase();
      if (code === 'fr' || code === 'en') {
        lang = code;
        break;
      }
    }
  }
  root.setAttribute('data-lang', lang);
  if (lang !== 'fr') {
    root.classList.add('i18n-pending');
    setTimeout(function () {
      root.classList.remove('i18n-pending');
    }, 1500);
  }
})();
