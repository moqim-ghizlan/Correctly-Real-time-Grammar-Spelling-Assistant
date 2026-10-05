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
  const viewport = document.createElement('div');
  viewport.style.cssText =
    'position:fixed;overflow:hidden;pointer-events:none;color:transparent;';
  Object.assign(viewport.style, {
    left: box.left + field.clientLeft + 'px',
    top: box.top + field.clientTop + 'px',
    width: field.clientWidth + 'px',
    height: field.clientHeight + 'px',
  });
  const mirror = document.createElement('div');
  mirror.style.cssText =
    'position:relative;box-sizing:border-box;border:0;margin:0;color:transparent;';
  for (const property of MIRROR_PROPERTIES)
    mirror.style[property] = style[property];
  mirror.style.width = field.clientWidth + 'px';
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

export function visibleFieldBox(field: HTMLElement): Box | undefined {
  let clip = intersectRect(field.getBoundingClientRect(), {
    left: 0,
    top: 0,
    width: window.innerWidth,
    height: window.innerHeight,
  });
  for (
    let element: HTMLElement | null = field;
    element && clip;
    element = element.parentElement
  ) {
    const style = getComputedStyle(element);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      style.opacity === '0'
    )
      return;
    if (element === field) continue;
    const clippedX = ['hidden', 'clip', 'scroll', 'auto'].includes(
      style.overflowX || style.overflow,
    );
    const clippedY = ['hidden', 'clip', 'scroll', 'auto'].includes(
      style.overflowY || style.overflow,
    );
    if (!clippedX && !clippedY) continue;
    const bounds = element.getBoundingClientRect();
    clip = intersectRect(clip, {
      left: clippedX ? bounds.left + element.clientLeft : clip.left,
      top: clippedY ? bounds.top + element.clientTop : clip.top,
      width: clippedX ? element.clientWidth : clip.width,
      height: clippedY ? element.clientHeight : clip.height,
    });
  }
  return clip;
}
