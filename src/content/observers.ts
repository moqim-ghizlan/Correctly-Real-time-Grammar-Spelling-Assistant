import {
  findFields,
  FIELD_SELECTOR,
  isEditableField,
  type EditableField,
} from './field-detector';
const FIELD_ATTRIBUTES = ['contenteditable', 'type', 'disabled', 'readonly'];
export function observeFields(
  root: HTMLElement,
  register: (field: EditableField) => void,
  prune: () => void,
  layoutChanged: () => void = () => {},
) {
  findFields(root).forEach(register);
  const observer = new MutationObserver((records) => {
    let relevant = false;
    for (const record of records) {
      if (
        record.target instanceof Element &&
        record.target.closest('[data-correctly-ui]')
      )
        continue;
      relevant = true;
      if (
        record.type === 'attributes' &&
        record.target instanceof Element &&
        FIELD_ATTRIBUTES.includes(record.attributeName ?? '')
      ) {
        if (isEditableField(record.target)) register(record.target);
        record.target.querySelectorAll(FIELD_SELECTOR).forEach((element) => {
          if (isEditableField(element)) register(element);
        });
      }
      for (const node of record.addedNodes)
        if (
          node instanceof HTMLElement &&
          !node.hasAttribute('data-correctly-ui')
        )
          findFields(node).forEach(register);
    }
    if (relevant) {
      prune();
      layoutChanged();
    }
  });
  observer.observe(root, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: [...FIELD_ATTRIBUTES, 'class', 'style', 'hidden'],
  });
  if (root === document.body)
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  return () => observer.disconnect();
}
