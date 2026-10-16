import type { Locale } from '../shared/locale';
import { HTML_MARKUP, type HtmlKey } from './messages-html';
import type { OptionsMessages } from './messages';

// 5.13: puts the chosen language on the static settings page. Plain texts go
// through textContent; the few with inline markup are rebuilt node by node
// from a tiny allowlist (strong, kbd, code, in-page links), never innerHTML.

const TOKEN =
  /<(strong|kbd|code)>|<\/(strong|kbd|code)>|<a href="(#[a-z-]+)">|<\/a>/g;

/** Text with the allowed inline tags → DOM nodes (anything else stays text). */
export function renderInline(doc: Document, target: Element, text: string) {
  const root = doc.createDocumentFragment();
  const stack: Node[] = [root];
  const top = () => stack[stack.length - 1]!;
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last)
      top().appendChild(doc.createTextNode(text.slice(last, match.index)));
    last = match.index + match[0].length;
    const [, open, close, href] = match;
    if (open || href) {
      const node = doc.createElement(open ?? 'a');
      if (href) node.setAttribute('href', href);
      top().appendChild(node);
      stack.push(node);
    } else if ((close || match[0] === '</a>') && stack.length > 1) stack.pop();
  }
  if (last < text.length)
    top().appendChild(doc.createTextNode(text.slice(last)));
  target.replaceChildren(root);
}

const MARKUP = new Set<string>(HTML_MARKUP);

/** Applies the language to every tagged node of the page. */
export function localizePage(
  doc: Document,
  m: OptionsMessages,
  locale: Locale,
): void {
  doc.documentElement.lang = locale;
  doc.title = m.documentTitle;
  const text = (key: string | undefined) =>
    key && key in m.html ? m.html[key as HtmlKey] : null;
  for (const node of doc.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const value = text(node.dataset.i18n);
    if (value !== null) node.textContent = value;
  }
  for (const node of doc.querySelectorAll<HTMLElement>('[data-i18n-html]')) {
    const key = node.dataset.i18nHtml;
    const value = text(key);
    if (value !== null && key && MARKUP.has(key))
      renderInline(doc, node, value);
  }
  for (const node of doc.querySelectorAll<HTMLElement>('[data-i18n-aria]')) {
    const value = text(node.dataset.i18nAria);
    if (value !== null) node.setAttribute('aria-label', value);
  }
}
