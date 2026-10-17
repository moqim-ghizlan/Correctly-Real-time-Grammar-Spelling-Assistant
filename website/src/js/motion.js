// Scroll-driven motion, only with the `motion` class (boot.js: JavaScript on
// and no reduced-motion preference). Content is never hidden otherwise:
// elements get `.reveal` here, so without this script they simply show.
//  - sections, cards and list items rise in, staggered, on first view;
//  - a few blocks replay their own illustration when they come into view
//    (`.is-live`): correction marks, formality slider, summary, steps, the
//    request-path diagram;
//  - the demo's active-tab underline slides between tabs.
(function () {
  const root = document.documentElement;

  const REVEAL = [
    '.section-head',
    '.more-head',
    '.benefit',
    '.act',
    '.act-page',
    '.film-note',
    '.film-chips',
    '.demo-intro',
    '.demo-window',
    '.step',
    '.safe',
    '.shot',
    '.diagram',
    '.pcol',
    '.privacy-access',
    '.feature',
    '.case',
    '.faq-grid > h2',
    '.faq',
    '.release',
    '.install',
    '.footer-grid > *',
  ];

  // Elements that replay an illustration each time they enter the view.
  const LIVE = [
    '.act-correction',
    '.act-rewrite',
    '.act-translation',
    '.act-summary',
    '.steps',
    '.release',
  ];

  function initReveal() {
    const targets = document.querySelectorAll(REVEAL.join(','));
    // Stagger siblings of the same parent.
    const order = new Map();
    for (const el of targets) {
      const index = order.get(el.parentElement) ?? 0;
      order.set(el.parentElement, index + 1);
      el.style.setProperty('--stagger', String(Math.min(index, 6)));
      el.classList.add('reveal');
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.classList.add('is-in');
          io.unobserve(entry.target);
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.12 },
    );
    for (const el of targets) io.observe(el);
  }

  function initLive() {
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          entry.target.classList.toggle('is-live', entry.isIntersecting);
      },
      { threshold: 0.35 },
    );
    for (const el of document.querySelectorAll(LIVE.join(','))) io.observe(el);

    // The request path plays once by itself when the diagram is in view.
    const diagram = document.getElementById('diagram');
    if (diagram) {
      const once = new IntersectionObserver(
        ([entry]) => {
          if (!entry.isIntersecting) return;
          diagram.classList.add('is-running');
          once.disconnect();
        },
        { threshold: 0.6 },
      );
      once.observe(diagram);
    }
  }

  function initTabInk() {
    const list = document.querySelector('#demo-window [role="tablist"]');
    const ink = list?.querySelector('.cw-tab-ink');
    if (!ink) return;
    const place = () => {
      const tab = list.querySelector('[aria-selected="true"]');
      if (!tab) return;
      ink.style.transform = `translateX(${tab.offsetLeft}px)`;
      ink.style.width = `${tab.offsetWidth}px`;
    };
    list.classList.add('has-ink');
    new MutationObserver(place).observe(list, {
      attributes: true,
      subtree: true,
      attributeFilter: ['aria-selected'],
    });
    new ResizeObserver(place).observe(list);
    window.Correctly.i18n.onLangChange(() => requestAnimationFrame(place));
    place();
  }

  function initMotion() {
    initTabInk();
    if (
      !root.classList.contains('motion') ||
      !('IntersectionObserver' in window)
    )
      return;
    initReveal();
    initLive();
  }

  (window.Correctly ||= {}).motion = { initMotion };
})();
