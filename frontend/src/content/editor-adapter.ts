import type { EditableField } from './field-detector';
import {
  getTextFromField,
  getEditableTextModel,
  offsetFromModel,
} from './text-extractor';
import { applyReplacement } from './replacement';
import type { CorrectionMatch } from '../correction/correction-types';
export interface EditorSelection {
  start: number;
  end: number;
}
export interface EditorAdapter {
  getText(): string;
  getSelection(): EditorSelection | null;
  setSelection(selection: EditorSelection): boolean;
  replaceRange(match: CorrectionMatch, replacement: string): boolean;
}
export function createEditorAdapter(field: EditableField): EditorAdapter {
  return {
    getText: () => getTextFromField(field),
    replaceRange: (match, replacement) =>
      applyReplacement(field, match, replacement),
    setSelection: ({ start, end }) => {
      if (start < 0 || end < start || end > getTextFromField(field).length)
        return false;
      field.focus({ preventScroll: true });
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ) {
        if (field.selectionStart === null) return false;
        field.setSelectionRange(start, end);
        return true;
      }
      const tree = field.getRootNode();
      const selection =
        (
          tree as ShadowRoot & { getSelection?: () => Selection | null }
        ).getSelection?.() ?? field.ownerDocument.getSelection();
      const model = getEditableTextModel(field);
      const first = model.points[start],
        last = model.points[end];
      if (!selection || !first || !last) return false;
      selection.setBaseAndExtent(
        first.node,
        first.offset,
        last.node,
        last.offset,
      );
      return true;
    },
    getSelection: () => {
      if (
        field instanceof HTMLInputElement ||
        field instanceof HTMLTextAreaElement
      ) {
        return field.selectionStart === null || field.selectionEnd === null
          ? null
          : { start: field.selectionStart, end: field.selectionEnd };
      }
      const tree = field.getRootNode();
      const selection =
        (
          tree as ShadowRoot & { getSelection?: () => Selection | null }
        ).getSelection?.() ?? field.ownerDocument.getSelection();
      if (
        !selection ||
        !field.contains(selection.anchorNode) ||
        !field.contains(selection.focusNode)
      )
        return null;
      const model = getEditableTextModel(field);
      const anchor = offsetFromModel(
        model,
        selection.anchorNode,
        selection.anchorOffset,
      );
      const focus = offsetFromModel(
        model,
        selection.focusNode,
        selection.focusOffset,
      );
      return anchor < 0 || focus < 0
        ? null
        : { start: Math.min(anchor, focus), end: Math.max(anchor, focus) };
    },
  };
}
