import { isInsideCorrectlyUI } from './field-detector';
// Discovery is event-driven; mutations only maintain the active editor.
export function observeFields(
  root: HTMLElement,
  prune: () => void,
  layoutChanged: () => void = () => {},
) {
  const observer = new MutationObserver((records) => {
    if (!records.some((record) => !isInsideCorrectlyUI(record.target))) return;
    prune();
    layoutChanged();
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [
      'contenteditable',
      'type',
      'disabled',
      'readonly',
      'class',
      'style',
      'hidden',
    ],
  });
  return () => observer.disconnect();
}
