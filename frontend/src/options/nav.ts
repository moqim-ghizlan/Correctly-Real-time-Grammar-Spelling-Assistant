// Settings page navigation: one page shown at a time, chosen by the URL hash
// (#providers, #usage-limits…). A hash naming an element inside a page shows
// that page. Every page stays in the DOM, so the sections keep working
// whether they are shown or not.

/** Shows the page named by `hash` (or the first one) and marks its link. */
export function showPage(doc: Document, hash: string): HTMLElement | null {
  const pages = [...doc.querySelectorAll<HTMLElement>('.page')];
  const id = decodeURIComponent(hash.replace(/^#/, ''));
  const target = id ? doc.getElementById(id) : null;
  const page =
    (target?.closest<HTMLElement>('.page') ?? null) || pages[0] || null;
  for (const item of pages) item.hidden = item !== page;
  for (const link of doc.querySelectorAll<HTMLAnchorElement>(
    '.sidebar a[href^="#"]',
  )) {
    if (page && link.getAttribute('href') === `#${page.id}`)
      link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  }
  return page;
}

export function installNav(doc: Document, win: Window): void {
  const update = () => {
    const page = showPage(doc, win.location.hash);
    const target = doc.getElementById(win.location.hash.slice(1));
    // A whole page starts at the top; an inner anchor scrolls to itself.
    if (target && target !== page) target.scrollIntoView();
    else win.scrollTo(0, 0);
  };
  win.addEventListener('hashchange', update);
  update();
}
