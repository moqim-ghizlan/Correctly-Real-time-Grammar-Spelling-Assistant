export type EditableField =
  HTMLInputElement | HTMLTextAreaElement | HTMLElement;
export const FIELD_SELECTOR = 'textarea, input, [contenteditable]';
export function parentAcrossShadow(node: Node): HTMLElement | null {
  return (
    node.parentElement ??
    (node.getRootNode() instanceof ShadowRoot
      ? ((node.getRootNode() as ShadowRoot).host as HTMLElement)
      : null)
  );
}
export function isInsideCorrectlyUI(node: Node): boolean {
  for (
    let current: Node | null = node;
    current;
    current = parentAcrossShadow(current)
  )
    if (current instanceof Element && current.hasAttribute('data-correctly-ui'))
      return true;
  return false;
}
function allowed(element: HTMLElement): boolean {
  if (
    isInsideCorrectlyUI(element) ||
    element.matches(':disabled') ||
    element.closest('[contenteditable="false"]')
  )
    return false;
  for (
    let current: HTMLElement | null = element;
    current;
    current = parentAcrossShadow(current)
  ) {
    const style = getComputedStyle(current);
    if (
      current.hidden ||
      current.inert ||
      current.hasAttribute('inert') ||
      style.display === 'none' ||
      style.opacity === '0'
    )
      return false;
  }
  return !['hidden', 'collapse'].includes(getComputedStyle(element).visibility);
}
export function getEditableRoot(node: Node): EditableField | null {
  let current = node instanceof HTMLElement ? node : node.parentElement;
  if (!current || !allowed(current)) return null;
  let root: HTMLElement | null = null;
  for (; current; current = current.parentElement) {
    if (current instanceof HTMLTextAreaElement)
      return !current.disabled && !current.readOnly && allowed(current)
        ? current
        : null;
    if (current instanceof HTMLInputElement)
      return ['text', 'search', 'email', 'url', 'tel'].includes(current.type) &&
        !current.disabled &&
        !current.readOnly &&
        allowed(current)
        ? current
        : null;
    const editable = current.getAttribute('contenteditable')?.toLowerCase();
    if (editable === 'false') break;
    if (editable === '' || editable === 'true' || editable === 'plaintext-only')
      root = current;
  }
  return root && allowed(root) ? root : null;
}
export function isEditableField(element: Element): element is EditableField {
  return element instanceof HTMLElement && getEditableRoot(element) === element;
}
export function findEditableElement(
  eventOrNode: Event | Node,
): EditableField | null {
  if (eventOrNode instanceof Node) return getEditableRoot(eventOrNode);
  const path = eventOrNode.composedPath?.() ?? [];
  if (!path.length && eventOrNode.target) path.push(eventOrNode.target);
  if (path.some((node) => node instanceof Node && isInsideCorrectlyUI(node)))
    return null;
  const target = path.find((node) => node instanceof Node);
  return target instanceof Node ? getEditableRoot(target) : null;
}
export function findFields(root: ParentNode): EditableField[] {
  const elements = [...root.querySelectorAll(FIELD_SELECTOR)];
  if (root instanceof Element) elements.unshift(root);
  return elements.filter(isEditableField);
}
