// Client dimensions are unscaled; DOM and Range rectangles include CSS zoom.
export function effectiveZoom(element: HTMLElement): number {
  const native = (element as HTMLElement & { currentCSSZoom?: number })
    .currentCSSZoom;
  if (typeof native === 'number' && Number.isFinite(native) && native > 0)
    return native;
  let result = 1;
  for (
    let node: HTMLElement | null = element;
    node;
    node = node.parentElement
  ) {
    const value = getComputedStyle(node).getPropertyValue('zoom') || '1';
    const factor = parseFloat(value) / (value.endsWith('%') ? 100 : 1);
    if (Number.isFinite(factor) && factor > 0) result *= factor;
  }
  return result;
}

// UI positions use viewport coordinates from Range.getClientRects().
export function synchronizeUiZoom(host: HTMLElement) {
  host.style.setProperty(
    'zoom',
    String(1 / effectiveZoom(host.ownerDocument.documentElement)),
    'important',
  );
}
