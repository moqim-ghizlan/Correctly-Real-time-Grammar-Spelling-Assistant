import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DRAG_THRESHOLD,
  HANDLE_HEIGHT,
  HANDLE_MARGIN,
  RightEdgeHandle,
  installHandle,
} from '../../src/content/handle';
import {
  HANDLE_POSITION,
  OPEN_MODAL,
  SMART_BUTTON_OFF,
} from '../../src/shared/contracts';

// V5.11 right-edge handle: catalog IDs H01–H12 (v5/v5.11_done.md §19).

const ID = 'correctlyextensionid';
const HEIGHT = 600;
let send: ReturnType<typeof vi.fn<(message: unknown) => Promise<unknown>>>;
let onMessage: (message: unknown, sender: { id?: string }) => void;

/** jsdom builds untrusted events; the handle's trust check is injected. */
const make = (yRatio = 0.5) =>
  new RightEdgeHandle(document, { send, yRatio, trusted: () => true });

const pointer = (
  handle: RightEdgeHandle,
  kind: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  clientY: number,
  clientX = 790,
) => {
  const event = new MouseEvent(kind, { bubbles: true, clientX, clientY });
  Object.assign(event, { pointerId: 1 });
  handle.button.dispatchEvent(event);
};
const opens = () =>
  send.mock.calls.filter(
    ([message]) => (message as { type: string }).type === OPEN_MODAL,
  ).length;

beforeEach(() => {
  for (const node of document.querySelectorAll('correctly-handle'))
    node.remove();
  const state = globalThis as { correctlyHandle?: RightEdgeHandle };
  state.correctlyHandle?.dispose();
  delete state.correctlyHandle;
  send = vi.fn(() => Promise.resolve(undefined));
  vi.stubGlobal('chrome', {
    runtime: {
      id: ID,
      sendMessage: send,
      onMessage: {
        addListener: (callback: typeof onMessage) => (onMessage = callback),
      },
    },
  });
  vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(
    HEIGHT,
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('placement', () => {
  it('H01/H02: one handle, fixed to the right edge, vertically centred by default', () => {
    const handle = make();
    expect(document.querySelectorAll('correctly-handle')).toHaveLength(1);
    expect(handle.top).toBe(HEIGHT / 2 - HANDLE_HEIGHT / 2);
    expect(handle.button.style.top).toBe(`${HEIGHT / 2 - HANDLE_HEIGHT / 2}px`);
    // Anchored to the viewport, not to a field: focusing editors moves nothing.
    document.body.innerHTML = '<textarea></textarea>';
    document.querySelector('textarea')!.focus();
    expect(handle.top).toBe(HEIGHT / 2 - HANDLE_HEIGHT / 2);
    expect(handle.button.getAttribute('role')).toBe('button');
    expect(handle.button.getAttribute('aria-label')).toMatch(/Open Correctly/);
    expect(handle.button.querySelector('svg')).not.toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('H09/H10: a saved position is restored and clamped on resize', () => {
    const handle = make(0.25);
    expect(handle.top).toBe(0.25 * HEIGHT - HANDLE_HEIGHT / 2);
    const extreme = make(1);
    expect(extreme.top).toBe(HEIGHT - HANDLE_MARGIN - HANDLE_HEIGHT);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(
      200,
    );
    window.dispatchEvent(new Event('resize'));
    expect(extreme.top).toBe(200 - HANDLE_MARGIN - HANDLE_HEIGHT);
    expect(extreme.button.style.top).toBe(`${extreme.top}px`);
  });
});

describe('pointer gestures', () => {
  it('H03/H04: a plain press-release opens the modal exactly once', () => {
    const handle = make();
    handle.button.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    expect(send).not.toHaveBeenCalled();
    pointer(handle, 'pointerdown', 300);
    pointer(handle, 'pointermove', 302);
    pointer(handle, 'pointerup', 302);
    handle.button.click();
    expect(opens()).toBe(1);
  });

  it('H05/H06/H07: a drag moves Y only, saves the position and never opens', () => {
    const handle = make();
    pointer(handle, 'pointerdown', 300, 790);
    pointer(handle, 'pointermove', 300 - DRAG_THRESHOLD - 94, 100);
    expect(handle.top).toBe(200 - HANDLE_HEIGHT / 2);
    expect(handle.button.style.right).toBe('');
    expect(handle.button.style.left).toBe('');
    pointer(handle, 'pointerup', 200, 100);
    expect(opens()).toBe(0);
    expect(send).toHaveBeenCalledWith({
      type: HANDLE_POSITION,
      yRatio: 200 / HEIGHT,
    });
  });

  it('H08: dragging past the top or bottom clamps to the safe margin', () => {
    const handle = make();
    pointer(handle, 'pointerdown', 300);
    pointer(handle, 'pointermove', -500);
    expect(handle.top).toBe(HANDLE_MARGIN);
    pointer(handle, 'pointermove', 5000);
    expect(handle.top).toBe(HEIGHT - HANDLE_MARGIN - HANDLE_HEIGHT);
    pointer(handle, 'pointerup', 5000);
    expect(opens()).toBe(0);
  });

  it('pointercancel or window blur ends a drag without opening', () => {
    const handle = make();
    pointer(handle, 'pointerdown', 300);
    pointer(handle, 'pointermove', 250);
    pointer(handle, 'pointercancel', 250);
    pointer(handle, 'pointerup', 250);
    pointer(handle, 'pointerdown', 300);
    window.dispatchEvent(new Event('blur'));
    pointer(handle, 'pointerup', 300);
    expect(opens()).toBe(0);
  });

  it('untrusted (page-made) events neither open nor move it', () => {
    const handle = new RightEdgeHandle(document, { send, yRatio: 0.5 });
    pointer(handle, 'pointerdown', 300);
    pointer(handle, 'pointermove', 100);
    pointer(handle, 'pointerup', 100);
    handle.button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
    );
    expect(send).not.toHaveBeenCalled();
    expect(handle.top).toBe(HEIGHT / 2 - HANDLE_HEIGHT / 2);
  });

  it('pressing it keeps the focus in the page field (no selection loss)', () => {
    const handle = make();
    const down = new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
    });
    handle.button.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(true);
  });
});

describe('keyboard and modal visibility', () => {
  it('R07: Enter/Space open; arrows move it and save', () => {
    const handle = make();
    const key = (name: string) =>
      handle.button.dispatchEvent(
        new KeyboardEvent('keydown', { key: name, bubbles: true }),
      );
    key('Enter');
    key(' ');
    expect(opens()).toBe(2);
    key('ArrowUp');
    expect(handle.yRatio).toBeCloseTo(0.45);
    expect(send).toHaveBeenLastCalledWith({
      type: HANDLE_POSITION,
      yRatio: handle.yRatio,
    });
  });

  it('H11/H12: hidden while the modal is open, back at the same Y after', () => {
    const handle = make(0.3);
    handle.modalOpen(true);
    expect(handle.button.hidden).toBe(true);
    handle.activate();
    expect(opens()).toBe(0);
    handle.modalOpen(false);
    expect(handle.button.hidden).toBe(false);
    expect(handle.top).toBe(0.3 * HEIGHT - HANDLE_HEIGHT / 2);
  });

  it('installHandle: one per document; turned off from the settings removes it', () => {
    const first = installHandle(document, 0.5, send);
    expect(installHandle(document, 0.2, send)).toBe(first);
    expect(document.querySelectorAll('correctly-handle')).toHaveLength(1);
    onMessage({ type: SMART_BUTTON_OFF }, { id: 'someone-else' });
    expect(document.querySelectorAll('correctly-handle')).toHaveLength(1);
    onMessage({ type: SMART_BUTTON_OFF }, { id: ID });
    expect(document.querySelectorAll('correctly-handle')).toHaveLength(0);
  });

  it('installHandle starts hidden if the modal is already visible', () => {
    (globalThis as { correctlyModal?: unknown }).correctlyModal = {
      visible: true,
    };
    const handle = installHandle(document, 0.5, send);
    expect(handle.button.hidden).toBe(true);
    delete (globalThis as { correctlyModal?: unknown }).correctlyModal;
  });
});
