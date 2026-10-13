import type { CorrectionMatch } from '../correction/correction-types';
import { isEditableField, type EditableField } from './field-detector';
import {
  getTextFromField,
  getEditableTextModel,
  rangeFromModel,
  offsetFromModel,
} from './text-extractor';
export function replaceTextRange(
  text: string,
  offset: number,
  length: number,
  replacement: string,
) {
  if (
    !Number.isInteger(offset) ||
    !Number.isInteger(length) ||
    offset < 0 ||
    length < 0 ||
    offset + length > text.length
  )
    throw new RangeError('Invalid range');
  return text.slice(0, offset) + replacement + text.slice(offset + length);
}
export function updatedCaret(
  position: number,
  offset: number,
  length: number,
  replacementLength: number,
) {
  if (position <= offset) return position;
  if (position >= offset + length) return position + replacementLength - length;
  return offset + replacementLength;
}
export function applyReplacement(
  field: EditableField,
  match: CorrectionMatch,
  replacement: string,
): boolean {
  if (!field.isConnected || !isEditableField(field)) return false;
  const current = getTextFromField(field);
  if (
    current !== match.sourceText ||
    current.slice(match.offset, match.offset + match.length) !==
      match.originalFragment
  )
    return false;
  let inputDispatched = false;
  const permitFallback = () => {
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      composed: true,
      cancelable: true,
      inputType: 'insertReplacementText',
      data: replacement,
    });
    return (
      field.dispatchEvent(event) &&
      field.isConnected &&
      isEditableField(field) &&
      getTextFromField(field) === current
    );
  };
  const expected = replaceTextRange(
    current,
    match.offset,
    match.length,
    replacement,
  );
  if (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
  ) {
    if (!permitFallback()) return false;
    const start = field.selectionStart ?? 0,
      end = field.selectionEnd ?? start,
      direction = field.selectionDirection ?? 'none';
    const scrollTop = field.scrollTop,
      scrollLeft = field.scrollLeft;
    const prototype =
      field instanceof HTMLInputElement
        ? HTMLInputElement.prototype
        : HTMLTextAreaElement.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
    if (!descriptor?.set) return false;
    descriptor.set.call(field, expected);
    field.focus({ preventScroll: true });
    if (field.selectionStart !== null)
      field.setSelectionRange(
        updatedCaret(start, match.offset, match.length, replacement.length),
        updatedCaret(end, match.offset, match.length, replacement.length),
        direction,
      );
    field.scrollTop = scrollTop;
    field.scrollLeft = scrollLeft;
  } else {
    const model = getEditableTextModel(field),
      range = rangeFromModel(model, match.offset, match.length);
    // Synthetic block separators cannot safely be replaced as a DOM Range.
    if (!range || range.toString() !== match.originalFragment) return false;
    const tree = field.getRootNode();
    const selection =
      (
        tree as ShadowRoot & { getSelection?: () => Selection | null }
      ).getSelection?.() ?? field.ownerDocument.getSelection();
    const anchor = selection
      ? offsetFromModel(model, selection.anchorNode, selection.anchorOffset)
      : -1;
    const focus = selection
      ? offsetFromModel(model, selection.focusNode, selection.focusOffset)
      : -1;
    field.focus({ preventScroll: true });
    if (selection && typeof field.ownerDocument.execCommand === 'function') {
      const saved = selection.rangeCount
        ? selection.getRangeAt(0).cloneRange()
        : null;
      selection.removeAllRanges();
      selection.addRange(range);
      let beforeInput: InputEvent | undefined;
      const onBeforeInput = (event: Event) => {
        beforeInput = event as InputEvent;
      };
      field.addEventListener('beforeinput', onBeforeInput);
      const onInput = () => {
        inputDispatched = true;
      };
      field.addEventListener('input', onInput);
      try {
        field.ownerDocument.execCommand('insertText', false, replacement);
      } catch {
        // The guarded leaf fallback below remains available.
      } finally {
        field.removeEventListener('input', onInput);
        field.removeEventListener('beforeinput', onBeforeInput);
      }
      const edited = getTextFromField(field);
      if (edited !== expected && edited !== current) return false;
      if (edited === current) {
        selection.removeAllRanges();
        if (saved) selection.addRange(saved);
      }
      if (beforeInput?.defaultPrevented) return false;
    }
    if (getTextFromField(field) === current) {
      if (!permitFallback()) return false;
      inputDispatched = false;
      // Preserve the text leaf identity for controlled editors when browser
      // insertion is unavailable. Cross-leaf edits require the editing API.
      if (
        !field.contains(range.startContainer) ||
        !field.contains(range.endContainer) ||
        !(range.startContainer instanceof Text) ||
        range.startContainer !== range.endContainer
      )
        return false;
      range.startContainer.replaceData(
        range.startOffset,
        range.endOffset - range.startOffset,
        replacement,
      );
    }
    field.focus({ preventScroll: true });
    const next = getEditableTextModel(field);
    const anchorPoint =
      next.points[
        anchor < 0
          ? match.offset + replacement.length
          : updatedCaret(anchor, match.offset, match.length, replacement.length)
      ];
    const focusPoint =
      next.points[
        focus < 0
          ? match.offset + replacement.length
          : updatedCaret(focus, match.offset, match.length, replacement.length)
      ];
    if (selection && anchorPoint && focusPoint)
      selection.setBaseAndExtent(
        anchorPoint.node,
        anchorPoint.offset,
        focusPoint.node,
        focusPoint.offset,
      );
  }
  if (!inputDispatched)
    field.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        composed: true,
        inputType: 'insertReplacementText',
        data: replacement,
      }),
    );
  return getTextFromField(field) === expected;
}
