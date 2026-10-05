import { effectiveZoom, synchronizeUiZoom } from './css-zoom';
import type { CorrectionMatch } from '../correction/correction-types';
const MIRROR_PROPERTIES = [
  'fontFamily',
  'fontSize',
  'fontWeight',
  'fontStyle',
  'fontVariant',
  'lineHeight',
  'letterSpacing',
  'wordSpacing',
  'textAlign',
  'textIndent',
  'textTransform',
  'direction',
  'tabSize',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'wordBreak',
  'overflowWrap',
] as const;
export function createUiHost(): { host: HTMLDivElement; root: ShadowRoot } {
  const host = document.createElement('div');
  host.setAttribute('data-correctly-ui', '');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText =
    'all:initial!important;position:fixed!important;inset:0!important;pointer-events:none!important;z-index:2147483646!important;';
  const root = host.attachShadow({ mode: 'open' });
  document.documentElement.append(host);
  synchronizeUiZoom(host);
  return { host, root };
}
export function mirrorField(
  field: HTMLInputElement | HTMLTextAreaElement,
  text: string,
  matches: CorrectionMatch[],
  container: HTMLElement,
): Map<string, HTMLElement> {
  const style = getComputedStyle(field),
    box = field.getBoundingClientRect();
  const zoom = effectiveZoom(field);
  const viewport = document.createElement('div');
  viewport.style.cssText =
    'position:fixed;overflow:hidden;pointer-events:none;color:transparent;';
  Object.assign(viewport.style, {
    left: box.left + field.clientLeft * zoom + 'px',
    top: box.top + field.clientTop * zoom + 'px',
    width: field.clientWidth * zoom + 'px',
    height: field.clientHeight * zoom + 'px',
  });
  const mirror = document.createElement('div');
  mirror.style.cssText =
    'position:relative;box-sizing:border-box;border:0;margin:0;color:transparent;';
  for (const property of MIRROR_PROPERTIES)
    mirror.style[property] = style[property];
  mirror.style.width = field.clientWidth + 'px';
  mirror.style.zoom = String(zoom);
  if (field instanceof HTMLInputElement)
    mirror.style.lineHeight =
      Math.max(
        1,
        field.clientHeight -
          parseFloat(style.paddingTop || '0') -
          parseFloat(style.paddingBottom || '0'),
      ) + 'px';
  mirror.style.whiteSpace =
    field instanceof HTMLInputElement ||
    (field instanceof HTMLTextAreaElement && field.wrap === 'off')
      ? 'pre'
      : 'pre-wrap';
  mirror.style.transform =
    'translate(' + -field.scrollLeft + 'px,' + -field.scrollTop + 'px)';
  const markers = new Map<string, HTMLElement>();
  // Independent ranges avoid nesting or corrupting overlapping matches.
  mirror.textContent = text + '\u200b';
  viewport.append(mirror);
  container.append(viewport);
  const node = mirror.firstChild;
  if (!node) return markers;
  for (const match of matches) {
    const range = document.createRange();
    range.setStart(node, match.offset);
    range.setEnd(node, match.offset + match.length);
    const marker = document.createElement('span');
    marker.setAttribute('data-match', match.id);
    // Rectangles are copied into marker children for hit testing by the highlighter.
    if (typeof range.getClientRects === 'function') {
      for (const rect of range.getClientRects()) {
        const clipped = intersectRect(
          {
            left: rect.left,
            top: rect.top,
            width: Math.max(3, rect.width),
            height: rect.height,
          },
          viewport.getBoundingClientRect(),
        );
        if (!clipped) continue;
        const part = document.createElement('span');
        part.style.cssText = 'position:fixed;';
        Object.assign(part.style, {
          left: clipped.left + 'px',
          top: clipped.top + 'px',
          width: clipped.width + 'px',
          height: clipped.height + 'px',
        });
        marker.append(part);
      }
    }
    container.append(marker);
    markers.set(match.id, marker);
  }
  return markers;
}
export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}
export function intersectRect(rect: Box, clip: Box): Box | undefined {
  const left = Math.max(rect.left, clip.left),
    top = Math.max(rect.top, clip.top);
  const right = Math.min(rect.left + rect.width, clip.left + clip.width),
    bottom = Math.min(rect.top + rect.height, clip.top + clip.height);
  return right > left && bottom > top
    ? { left, top, width: right - left, height: bottom - top }
    : undefined;
}

// Root overflow (and body overflow when propagated) clips the viewport,
// not the element's possibly empty layout box.
function usesViewportClip(element: HTMLElement, style: CSSStyleDeclaration) {
  if (element === document.documentElement) return true;
  if (element !== document.body) return false;
  const rootStyle = getComputedStyle(document.documentElement);
  return (
    (rootStyle.overflowX || rootStyle.overflow || 'visible') === 'visible' &&
    (rootStyle.overflowY || rootStyle.overflow || 'visible') === 'visible' &&
    (!rootStyle.contain || rootStyle.contain === 'none') &&
    (!style.contain || style.contain === 'none')
  );
}

export function visibleFieldBox(field: HTMLElement): Box | undefined {
  let clip = intersectRect(field.getBoundingClientRect(), {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  // Positioned descendants escape overflow between themselves and their
  // containing block. Chromium's offsetParent also accounts for transformed
  // containing blocks of fixed elements; null means the viewport.
  let containingBlock: Element | null | undefined;
  for (
    let element: HTMLElement | null = field;
    element && clip;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    if (
      style.display === 'none' ||
      (element === field &&
        ['hidden', 'collapse'].includes(style.visibility)) ||
      style.opacity === '0'
    )
      return;
    if (containingBlock !== undefined && element !== containingBlock) continue;
    containingBlock = undefined;
    if (element !== field && !usesViewportClip(element, style)) {
      const clippedX = ['hidden', 'clip', 'scroll', 'auto'].includes(
        style.overflowX || style.overflow,
      );
      const clippedY = ['hidden', 'clip', 'scroll', 'auto'].includes(
        style.overflowY || style.overflow,
      );
      if (clippedX || clippedY) {
        const bounds = element.getBoundingClientRect();
        const zoom = effectiveZoom(element);
        clip = intersectRect(clip, {
          left: clippedX ? bounds.left + element.clientLeft * zoom : clip.left,
          top: clippedY ? bounds.top + element.clientTop * zoom : clip.top,
          width: clippedX ? element.clientWidth * zoom : clip.width,
          height: clippedY ? element.clientHeight * zoom : clip.height,
        });
      }
    }
    if (style.position === 'fixed' || style.position === 'absolute')
      containingBlock = element.offsetParent;
  }
  return clip;
}
