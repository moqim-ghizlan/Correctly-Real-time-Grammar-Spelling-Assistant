import { afterEach, expect, it, vi } from 'vitest';
import { visibleFieldBox, mirrorField } from '../../src/content/overlay';
afterEach(() => document.body.replaceChildren());
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
