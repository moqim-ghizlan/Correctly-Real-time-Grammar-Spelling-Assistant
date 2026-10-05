export type EditableField =
  HTMLInputElement | HTMLTextAreaElement | HTMLElement;
export const FIELD_SELECTOR = 'textarea, input, [contenteditable]';
export function isEditableField(element: Element): element is EditableField {
  if (
    element.matches(':disabled') ||
    element.closest('[data-correctly-ui], [contenteditable="false"]')
  )
    return false;
  if (element instanceof HTMLTextAreaElement)
    return !element.disabled && !element.readOnly;
  if (element instanceof HTMLInputElement)
    return (
      ['text', 'search'].includes(element.type) &&
      !element.disabled &&
      !element.readOnly
    );
  if (!(element instanceof HTMLElement)) return false;
  const editable = element.getAttribute('contenteditable');
  return (
    (editable === '' || editable === 'true' || editable === 'plaintext-only') &&
    !element.parentElement?.closest(
      '[contenteditable="true"], [contenteditable=""], [contenteditable="plaintext-only"]',
    )
  );
}
export function findFields(root: ParentNode): EditableField[] {
  const elements = [...root.querySelectorAll(FIELD_SELECTOR)];
  if (root instanceof Element) elements.unshift(root);
  return elements.filter(isEditableField);
}
