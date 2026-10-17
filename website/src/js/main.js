// Entry script (classic, deferred: works from file:// as well as a web
// server). The page is complete without it (French text, native
// <details>); this adds language, theme, menu, demo and motion.
(function () {
  const { i18n, theme, nav, demo, page, film, motion } = window.Correctly;
  i18n.initI18n();
  theme.initTheme();
  nav.initNav();
  demo.initDemo();
  page.initDiagram();
  page.initHandle();
  film.initFilm();
  motion.initMotion();
})();
