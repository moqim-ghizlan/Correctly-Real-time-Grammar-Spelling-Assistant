import { synchronizeUiZoom } from './css-zoom';
import type { CorrectionMatch } from '../correction/correction-types';
import { createUiHost, type Box } from './overlay';
export function calculatePopupPosition(
  anchor: Box,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const margin = 8,
    gap = 6;
  return {
    left: Math.max(
      margin,
      Math.min(anchor.left, viewportWidth - width - margin),
    ),
    top: Math.max(
      margin,
      Math.min(
        anchor.top + anchor.height + gap + height <= viewportHeight - margin
          ? anchor.top + anchor.height + gap
          : anchor.top - height - gap,
        viewportHeight - height - margin,
      ),
    ),
  };
}
export class SuggestionPopup {
  private ui = createUiHost();
  private panel: HTMLDivElement | undefined;
  private previousFocus: HTMLElement | undefined;
  constructor(private onClose: () => void = () => {}) {
    this.ui.host.removeAttribute('aria-hidden');
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.keydown, true);
  }
  private outside = (event: Event) => {
    if (!event.composedPath().includes(this.ui.host)) this.close();
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.panel) {
      this.close();
      this.previousFocus?.focus({ preventScroll: true });
    }
  };
  show(
    match: CorrectionMatch,
    anchor: Box,
    replace: (value: string) => void,
    ignore: () => void,
  ) {
    this.close();
    synchronizeUiZoom(this.ui.host);
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement)
      focused = focused.shadowRoot.activeElement;
    this.previousFocus = focused instanceof HTMLElement ? focused : undefined;
    const style = document.createElement('style');
    style.textContent =
      ':host{color-scheme:light dark} .panel{box-sizing:border-box;position:fixed;width:300px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#111827;font:14px system-ui;box-shadow:0 4px 18px #0002;pointer-events:auto} h2{font-size:12px;margin:0 0 8px;color:#6b7280} p{margin:0 0 10px} button{font:inherit;cursor:pointer;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;margin:3px;background:#f9fafb;color:#111827} button:hover,button:focus-visible{border-color:#2563eb;outline:2px solid #2563eb} .ignore{display:block;background:none;color:#6b7280}@media(prefers-color-scheme:dark){.panel{background:#111827;color:#f9fafb;border-color:#374151}button{background:#1f2937;color:#f9fafb;border-color:#374151}h2,.ignore{color:#9ca3af}}';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Suggestions Correctly');
    const title = document.createElement('h2');
    title.textContent =
      match.category === 'spelling' ? 'Orthographe' : 'Grammaire';
    const message = document.createElement('p');
    message.textContent = match.message;
    panel.append(title, message);
    for (const value of match.replacements.slice(0, 5)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value || 'Supprimer';
      button.addEventListener('click', () => {
        this.close();
        replace(value);
      });
      panel.append(button);
    }
    const ignoreButton = document.createElement('button');
    ignoreButton.type = 'button';
    ignoreButton.className = 'ignore';
    ignoreButton.textContent = 'Ignorer cette erreur';
    ignoreButton.addEventListener('click', () => {
      this.close();
      ignore();
      this.previousFocus?.focus({ preventScroll: true });
    });
    panel.append(ignoreButton);
    this.ui.root.append(style, panel);
    this.panel = panel;
    panel.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse') event.preventDefault();
    });
    const bounds = panel.getBoundingClientRect();
    const position = calculatePopupPosition(
      anchor,
      bounds.width || 300,
      bounds.height || 180,
      window.innerWidth,
      window.innerHeight,
    );
    panel.style.left = position.left + 'px';
    panel.style.top = position.top + 'px';
  }
  close() {
    const wasOpen = !!this.panel;
    this.ui.root.replaceChildren();
    this.panel = undefined;
    if (wasOpen) this.onClose();
  }
  dispose() {
    this.close();
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.keydown, true);
    this.ui.host.remove();
  }
}
