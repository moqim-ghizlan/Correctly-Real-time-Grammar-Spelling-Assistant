// Header: mobile menu (Escape and link clicks close it), background once
// the page scrolls, and the link of the section being read.
(function () {
  const { onLangChange, t } = window.Correctly.i18n;

  function initNav() {
    const header = document.querySelector('.site-header');
    const button = header.querySelector('.menu-btn');
    const menu = document.getElementById('mobile-menu');
    const isOpen = () => button.getAttribute('aria-expanded') === 'true';
    const label = () =>
      button.setAttribute(
        'aria-label',
        t(isOpen() ? 'nav.menuClose' : 'nav.menuOpen'),
      );

    function setOpen(open, focusButton = false) {
      header.classList.toggle('is-open', open);
      menu.classList.toggle('is-open', open);
      button.setAttribute('aria-expanded', String(open));
      label();
      if (focusButton) button.focus();
    }

    button.addEventListener('click', () => setOpen(!isOpen()));
    menu.addEventListener('click', (event) => {
      if (event.target.closest('a')) setOpen(false);
    });
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && isOpen()) setOpen(false, true);
    });
    window
      .matchMedia('(min-width: 960px)')
      .addEventListener('change', (query) => {
        if (query.matches) setOpen(false);
      });
    onLangChange(label);
    label();

    const sentinel = document.createElement('div');
    sentinel.style.cssText =
      'position:absolute;top:0;left:0;width:1px;height:8px;pointer-events:none';
    sentinel.setAttribute('aria-hidden', 'true');
    document.body.prepend(sentinel);
    new IntersectionObserver(([entry]) =>
      header.classList.toggle('is-scrolled', !entry.isIntersecting),
    ).observe(sentinel);

    const links = [...document.querySelectorAll('[data-nav]')];
    const byId = new Map(links.map((link) => [link.hash.slice(1), link]));
    const watched = document.querySelectorAll('main > section[id]');
    const current = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const active = byId.get(entry.target.id);
          for (const link of links) {
            if (link === active) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    for (const section of watched) current.observe(section);
  }

  (window.Correctly ||= {}).nav = { initNav };
})();
