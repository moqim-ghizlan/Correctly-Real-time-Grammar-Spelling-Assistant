// Page-level interactions: the request-path diagram and
// the page's own right-edge handle (shown once the hero has scrolled away).
(function () {
  function initDiagram() {
    const figure = document.getElementById('diagram');
    const button = document.getElementById('dg-play');
    if (!figure || !button) return;
    button.hidden = false;
    button.addEventListener('click', () => {
      figure.classList.remove('is-running');
      void figure.offsetWidth; // restart the CSS animations
      figure.classList.add('is-running');
    });
  }

  function initHandle() {
    const handle = document.getElementById('edge-handle');
    const hero = document.querySelector('.hero');
    const demo = document.getElementById('demo');
    if (!handle || !hero || !demo) return;
    let heroVisible = true;
    let demoVisible = false;

    function update() {
      const away = heroVisible || demoVisible;
      handle.classList.toggle('is-away', away);
      handle.inert = away;
    }

    handle.hidden = false;
    update();
    new IntersectionObserver(([entry]) => {
      heroVisible = entry.isIntersecting;
      update();
    }).observe(hero);
    new IntersectionObserver(
      ([entry]) => {
        demoVisible = entry.isIntersecting;
        update();
      },
      { threshold: 0.2 },
    ).observe(demo);

    handle.addEventListener('click', () => {
      const smooth = document.documentElement.classList.contains('motion');
      demo.scrollIntoView({
        behavior: smooth ? 'smooth' : 'auto',
        block: 'start',
      });
      demo
        .querySelector('[role="tab"][aria-selected="true"]')
        ?.focus({ preventScroll: true });
    });
  }

  (window.Correctly ||= {}).page = { initDiagram, initHandle };
})();
