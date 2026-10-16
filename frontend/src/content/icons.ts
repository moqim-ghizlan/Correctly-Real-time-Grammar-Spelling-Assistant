// V5.11: bundled inline SVG icons. Content scripts have no
// web_accessible_resources, so nothing is loaded from a URL.

const SVG = 'http://www.w3.org/2000/svg';

type Shape = [tag: string, attributes: Record<string, string>];

function svg(doc: Document, size: number, shapes: Shape[]): SVGSVGElement {
  const root = doc.createElementNS(SVG, 'svg');
  root.setAttribute('viewBox', '0 0 24 24');
  root.setAttribute('width', String(size));
  root.setAttribute('height', String(size));
  root.setAttribute('aria-hidden', 'true');
  root.setAttribute('focusable', 'false');
  for (const [tag, attributes] of shapes) {
    const node = doc.createElementNS(SVG, tag);
    for (const [name, value] of Object.entries(attributes))
      node.setAttribute(name, value);
    root.append(node);
  }
  return root;
}

const STROKE = {
  fill: 'none',
  stroke: 'currentColor',
  'stroke-width': '2',
  'stroke-linecap': 'round',
  'stroke-linejoin': 'round',
};

/** The Correctly logo: a white "C" with a check mark on the brand blue. */
export const logo = (doc: Document, size: number): SVGSVGElement =>
  svg(doc, size, [
    ['rect', { width: '24', height: '24', rx: '6', fill: '#2b5ce6' }],
    [
      'path',
      {
        d: 'M15.4 7.9A5.6 5.6 0 1 0 13.6 17.2',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '2.6',
        'stroke-linecap': 'round',
      },
    ],
    [
      'path',
      {
        d: 'M13.6 15.4l2 2 4.2-4.6',
        fill: 'none',
        stroke: '#fff',
        'stroke-width': '2.4',
        'stroke-linecap': 'round',
        'stroke-linejoin': 'round',
      },
    ],
  ]);

/** Settings gear (Feather "settings", MIT). */
export const gearIcon = (doc: Document): SVGSVGElement =>
  svg(doc, 18, [
    ['circle', { cx: '12', cy: '12', r: '3', ...STROKE }],
    [
      'path',
      {
        d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z',
        ...STROKE,
      },
    ],
  ]);

/** Hide: a chevron pointing down (minimize), never an X. */
export const hideIcon = (doc: Document): SVGSVGElement =>
  svg(doc, 18, [['path', { d: 'M6 9l6 6 6-6', ...STROKE }]]);
