// Theme button: system → light → dark → system. boot.js applied the
// initial theme; the choice is stored locally only.
(function () {
  const { onLangChange, t } = window.Correctly.i18n;

  const ORDER = ['system', 'light', 'dark'];
  const STORE = 'correctly-site.theme';
  const root = document.documentElement;
  const media = window.matchMedia('(prefers-color-scheme: dark)');

  const pref = () =>
    ORDER.includes(root.dataset.themePref) ? root.dataset.themePref : 'system';

  function resolve() {
    const p = pref();
    root.dataset.theme =
      p === 'dark' || (p === 'system' && media.matches) ? 'dark' : 'light';
  }

  function label() {
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      const text = t(`theme.${pref()}`);
      button.setAttribute('aria-label', text);
      button.title = text;
    }
  }

  function initTheme() {
    media.addEventListener('change', () => {
      if (pref() === 'system') resolve();
    });
    for (const button of document.querySelectorAll('[data-theme-toggle]')) {
      button.addEventListener('click', () => {
        const next = ORDER[(ORDER.indexOf(pref()) + 1) % ORDER.length];
        const before = root.dataset.theme;
        const swap = () => {
          root.dataset.themePref = next;
          resolve();
          label();
        };
        try {
          localStorage.setItem(STORE, next);
        } catch {
          // Storage blocked: the theme still changes for this page.
        }
        // The switch is atomic: every color changes in the same frame.
        // With View Transitions, the new theme is revealed as a circle
        // growing from the button over a snapshot of the old one, so no
        // half-switched state is ever painted.
        const after =
          next === 'dark' || (next === 'system' && media.matches)
            ? 'dark'
            : 'light';
        if (
          after === before ||
          !root.classList.contains('motion') ||
          !document.startViewTransition
        ) {
          swap();
          return;
        }
        const box = button.getBoundingClientRect();
        const x = box.left + box.width / 2;
        const y = box.top + box.height / 2;
        const radius = Math.hypot(
          Math.max(x, innerWidth - x),
          Math.max(y, innerHeight - y),
        );
        const transition = document.startViewTransition(swap);
        transition.ready
          .then(() =>
            root.animate(
              {
                clipPath: [
                  `circle(0px at ${x}px ${y}px)`,
                  `circle(${radius}px at ${x}px ${y}px)`,
                ],
              },
              {
                duration: 560,
                easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
                pseudoElement: '::view-transition-new(root)',
              },
            ),
          )
          .catch(() => {});
      });
    }
    onLangChange(label);
    label();
  }

  (window.Correctly ||= {}).theme = { initTheme };
})();
