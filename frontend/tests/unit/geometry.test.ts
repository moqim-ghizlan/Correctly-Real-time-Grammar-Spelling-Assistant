import { afterEach, expect, it, vi } from 'vitest';
import { visibleFieldBox, mirrorField } from '../../src/content/overlay';
afterEach(() => {
  document.body.replaceChildren();
  document.body.removeAttribute('style');
  document.documentElement.removeAttribute('style');
});
it('clips overlays to scrollable ancestor content and hides invisible fields', () => {
  const container = document.createElement('div'),
    field = document.createElement('textarea');
  container.style.overflow = 'hidden';
  container.append(field);
  document.body.append(container);
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(10, 10, 100, 100),
  );
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 50, 50),
  );
  Object.defineProperty(container, 'clientWidth', { value: 50 });
  Object.defineProperty(container, 'clientHeight', { value: 50 });
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
  container.style.opacity = '0';
  expect(visibleFieldBox(field)).toBeUndefined();
});
it('copies typography, dimensions, scrolling and user text without interpreting HTML', () => {
  const field = document.createElement('textarea');
  field.style.fontFamily = 'Georgia';
  field.style.padding = '12px';
  field.scrollTop = 14;
  field.scrollLeft = 5;
  document.body.append(field);
  Object.defineProperty(field, 'clientWidth', { value: 300 });
  Object.defineProperty(field, 'clientHeight', { value: 100 });
  const container = document.createElement('div');
  mirrorField(field, '<script>alert(1)</script>', [], container);
  const mirror = container.firstElementChild?.firstElementChild as HTMLElement;
  expect(mirror.style.fontFamily).toBe('Georgia');
  expect(mirror.style.paddingLeft).toBe('12px');
  expect(mirror.style.width).toBe('300px');
  expect(mirror.style.transform).toBe('translate(-5px,-14px)');
  expect(container.querySelector('script')).toBeNull();
  expect(mirror.textContent).toContain('<script>');
});

function setBox(element: HTMLElement, box: DOMRect) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue(box);
  vi.spyOn(element, 'clientWidth', 'get').mockReturnValue(box.width);
  vi.spyOn(element, 'clientHeight', 'get').mockReturnValue(box.height);
}

it('uses viewport clipping for overflow propagated from body', () => {
  const field = document.createElement('textarea');
  document.body.append(field);
  document.body.style.overflow = 'hidden';
  setBox(document.body, new DOMRect(0, 0, 300, 0));
  setBox(field, new DOMRect(10, 100, 100, 100));
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 100,
    width: 100,
    height: 100,
  });
});

it('uses the viewport instead of a short root box', () => {
  const field = document.createElement('textarea');
  document.body.append(field);
  document.documentElement.style.overflow = 'hidden';
  setBox(document.documentElement, new DOMRect(0, 0, 300, 0));
  setBox(field, new DOMRect(10, 100, 100, 100));
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 100,
    width: 100,
    height: 100,
  });
});

it.each(['root overflow', 'body containment', 'root containment'])(
  'keeps body clipping when propagation is disabled by %s',
  (mode) => {
    const field = document.createElement('textarea');
    document.body.append(field);
    document.body.style.overflow = 'hidden';
    if (mode === 'root overflow')
      document.documentElement.style.overflow = 'hidden';
    if (mode === 'body containment') document.body.style.contain = 'layout';
    if (mode === 'root containment')
      document.documentElement.style.contain = 'layout';
    setBox(document.body, new DOMRect(0, 0, 50, 50));
    setBox(field, new DOMRect(10, 10, 100, 100));
    expect(visibleFieldBox(field)).toEqual({
      left: 10,
      top: 10,
      width: 40,
      height: 40,
    });
  },
);

it('clips a fixed compose editor to its scroll area, not its zero-sized mounting parent', () => {
  document.body.innerHTML =
    '<div id="mount" style="overflow:hidden"><div id="compose" style="position:fixed"><div id="scroll" style="overflow:auto"><div id="editor" contenteditable="true"></div></div></div></div>';
  const mount = document.querySelector<HTMLElement>('#mount')!;
  const compose = document.querySelector<HTMLElement>('#compose')!;
  const scroll = document.querySelector<HTMLElement>('#scroll')!;
  const field = document.querySelector<HTMLElement>('#editor')!;
  setBox(mount, new DOMRect(0, 0, 0, 0));
  setBox(scroll, new DOMRect(0, 0, 50, 50));
  setBox(field, new DOMRect(10, 10, 100, 100));
  vi.spyOn(compose, 'offsetParent', 'get').mockReturnValue(null);
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
  mount.style.display = 'none';
  expect(visibleFieldBox(field)).toBeUndefined();
});

it('keeps overflow clipping at a transformed containing block of a fixed editor', () => {
  document.body.innerHTML =
    '<div id="container" style="transform:translateX(0);overflow:hidden"><div id="editor" style="position:fixed" contenteditable="true"></div></div>';
  const container = document.querySelector<HTMLElement>('#container')!;
  const field = document.querySelector<HTMLElement>('#editor')!;
  setBox(container, new DOMRect(0, 0, 50, 50));
  setBox(field, new DOMRect(10, 10, 100, 100));
  vi.spyOn(field, 'offsetParent', 'get').mockReturnValue(container);
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
});

it('ignores overflow between an absolute editor and its containing block', () => {
  document.body.innerHTML =
    '<div id="container" style="position:relative;overflow:hidden"><div id="mount" style="overflow:hidden"><div id="editor" style="position:absolute" contenteditable="true"></div></div></div>';
  const container = document.querySelector<HTMLElement>('#container')!;
  const mount = document.querySelector<HTMLElement>('#mount')!;
  const field = document.querySelector<HTMLElement>('#editor')!;
  setBox(container, new DOMRect(0, 0, 50, 50));
  setBox(mount, new DOMRect(0, 0, 0, 0));
  setBox(field, new DOMRect(10, 10, 100, 100));
  vi.spyOn(field, 'offsetParent', 'get').mockReturnValue(container);
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
});

it('shows an explicitly visible editor inside hidden Gmail-style layout ancestors', () => {
  const container = document.createElement('div');
  const field = document.createElement('div');
  container.style.visibility = 'hidden';
  field.style.visibility = 'visible';
  field.setAttribute('contenteditable', 'true');
  container.append(field);
  document.body.append(container);
  setBox(field, new DOMRect(10, 10, 100, 100));
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 100,
    height: 100,
  });
  field.style.visibility = 'hidden';
  expect(visibleFieldBox(field)).toBeUndefined();
  field.style.visibility = 'visible';
  container.style.opacity = '0';
  expect(visibleFieldBox(field)).toBeUndefined();
});

it('clips a zoomed scroll area in viewport coordinates', () => {
  const container = document.createElement('div');
  const field = document.createElement('div');
  container.style.overflow = 'hidden';
  container.append(field);
  document.body.append(container);
  Object.defineProperty(container, 'currentCSSZoom', { value: 0.5 });
  setBox(container, new DOMRect(0, 0, 100, 100));
  // client dimensions are before zoom; the visible box is 50 x 50.
  vi.spyOn(container, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(0, 0, 50, 50),
  );
  setBox(field, new DOMRect(10, 10, 100, 100));
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
});

it('scales the mirror viewport, typography and border offsets with the field zoom', () => {
  const field = document.createElement('textarea');
  document.body.append(field);
  Object.defineProperty(field, 'currentCSSZoom', { value: 0.9 });
  vi.spyOn(field, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(20, 30, 183.6, 39.6),
  );
  vi.spyOn(field, 'clientWidth', 'get').mockReturnValue(200);
  vi.spyOn(field, 'clientHeight', 'get').mockReturnValue(40);
  vi.spyOn(field, 'clientLeft', 'get').mockReturnValue(2);
  vi.spyOn(field, 'clientTop', 'get').mockReturnValue(2);
  const container = document.createElement('div');
  mirrorField(field, 'je sui ici', [], container);
  const viewport = container.firstElementChild as HTMLElement;
  const mirror = viewport.firstElementChild as HTMLElement;
  expect(parseFloat(viewport.style.left)).toBeCloseTo(21.8);
  expect(parseFloat(viewport.style.top)).toBeCloseTo(31.8);
  expect(parseFloat(viewport.style.width)).toBe(180);
  expect(parseFloat(viewport.style.height)).toBe(36);
  expect(mirror.style.width).toBe('200px');
  expect(mirror.style.zoom).toBe('0.9');
});

it('clips a shadow editor to the scrollable host and its outside ancestors', () => {
  const host = document.createElement('div');
  host.style.overflow = 'hidden';
  document.body.append(host);
  const shadow = host.attachShadow({ mode: 'open' });
  const field = document.createElement('textarea');
  shadow.append(field);
  setBox(host, new DOMRect(0, 0, 50, 50));
  setBox(field, new DOMRect(10, 10, 100, 100));
  expect(visibleFieldBox(field)).toEqual({
    left: 10,
    top: 10,
    width: 40,
    height: 40,
  });
  host.style.opacity = '0';
  expect(visibleFieldBox(field)).toBeUndefined();
});
