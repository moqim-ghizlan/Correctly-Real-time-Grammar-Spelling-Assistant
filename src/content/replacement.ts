import type { CorrectionMatch } from '../correction/correction-types';
import type { EditableField } from './field-detector';
import {
  getTextFromField,
  getEditableTextModel,
  rangeFromModel,
  type TextModel,
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
function pointOffset(model: TextModel, node: Node | null, offset: number) {
  return model.points.findIndex(
    (point) => point.node === node && point.offset === offset,
  );
}
export function applyReplacement(
  field: EditableField,
  match: CorrectionMatch,
  replacement: string,
): boolean {
  const current = getTextFromField(field);
  if (
    current !== match.sourceText ||
    current.slice(match.offset, match.offset + match.length) !==
      match.originalFragment
  )
    return false;
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
    const selection = window.getSelection();
    const anchor = selection
      ? pointOffset(model, selection.anchorNode, selection.anchorOffset)
      : -1;
    const focus = selection
      ? pointOffset(model, selection.focusNode, selection.focusOffset)
      : -1;
    // Controlled editors reconcile a whole DOM text leaf into their model.
    // Splitting that leaf can make them keep only the replacement fragment.
    // Keep its identity and full text; refuse edits crossing leaves.
    if (
      !(range.startContainer instanceof Text) ||
      range.startContainer !== range.endContainer
    )
      return false;
    range.startContainer.replaceData(
      range.startOffset,
      range.endOffset - range.startOffset,
      replacement,
    );
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
