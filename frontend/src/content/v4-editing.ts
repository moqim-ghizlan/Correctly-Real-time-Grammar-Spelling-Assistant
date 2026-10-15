import type { CorrectionMatch } from '../correction/correction-types';
import { createEditorAdapter } from './editor-adapter';
import { isEditableField, type EditableField } from './field-detector';
import { applyReplacement } from './replacement';
import { normalizeTrigger, type ShortcutSettings } from '../shared/shortcuts';

export interface SentenceSegment {
  start: number;
  end: number;
  text: string;
  complete: boolean;
  truncated?: boolean;
}
export interface SentenceChoice {
  match: CorrectionMatch;
  replacement: string;
}
export interface SentenceReview {
  segment: SentenceSegment;
  matches: CorrectionMatch[];
  unavailableCount: number;
}
export function planSentenceChoices(
  review: SentenceReview,
  choices: SentenceChoice[],
): string | null {
  if (
    !choices.length ||
    new Set(choices.map((choice) => choice.match)).size !== choices.length
  )
    return null;
  if (
    choices.some(
      ({ match, replacement }) =>
        !review.matches.includes(match) ||
        !match.replacements.includes(replacement),
    )
  )
    return null;
  return planSentence(
    review.segment,
    choices.map(({ match, replacement }) => ({
      ...match,
      replacements: [replacement],
    })),
    false,
  );
}
export function sentenceAt(text: string, caret: number): SentenceSegment {
  // Bound work to the existing maximum request size. Ambiguous punctuation is
  // retained in one segment and never grants permission for automatic editing.
  const before = text.slice(Math.max(0, caret - 5000), caret);
  const boundaries = [...before.matchAll(/[.!?…]["'»”)]*\s+(?=\S)/gu)];
  let start = Math.max(0, caret - 5000);
  let detectedStart = start === 0;
  for (const boundary of boundaries) {
    const prefix = before.slice(0, boundary.index + 1);
    if (!/(?:\b(?:M|Mme|Mr|Mrs|Dr|Prof|etc)|\b\p{L})\.$/iu.test(prefix)) {
      start = Math.max(0, caret - 5000) + boundary.index + boundary[0].length;
      detectedStart = true;
    }
  }
  const segment = text.slice(start, caret);
  const complete =
    /[.!?…]["'»”)]*\s*$/u.test(segment) &&
    !/(?:\b(?:M|Mme|Mr|Mrs|Dr|Prof|etc)|\b\p{L})\.\s*$/iu.test(segment) &&
    !/(?:https?:|www\.|@|\d\.\d|\.\.|[`<>{}])/iu.test(segment) &&
    detectedStart &&
    (start === 0 || /\s/u.test(text[start - 1] ?? ''));
  return {
    start,
    end: caret,
    text: segment,
    complete,
    truncated: !detectedStart,
  };
}
// Explicit review targets the clicked match, independently of the caret.
// Reuse the conservative boundary rules; never review a truncated fragment.
export function sentenceContaining(
  text: string,
  offset: number,
): SentenceSegment | null {
  const prefix = sentenceAt(text, offset);
  if (prefix.truncated) return null;
  const limit = Math.min(text.length, prefix.start + 5000);
  const tail = text.slice(offset, limit);
  for (const boundary of tail.matchAll(/[.!?…]["'»”)]*(?:\s+|$)/gu)) {
    const end = offset + boundary.index + boundary[0].length;
    if (end === limit && limit < text.length) continue;
    const segment = sentenceAt(text, end);
    if (segment.complete && segment.start <= offset) return segment;
  }
  if (limit < text.length) return null;
  return {
    start: prefix.start,
    end: limit,
    text: text.slice(prefix.start, limit),
    complete: false,
  };
}
export function planSentence(
  segment: SentenceSegment,
  matches: CorrectionMatch[],
  automatic: boolean,
): string | null {
  if (!segment.text || (automatic && !segment.complete)) return null;
  const selected = matches.filter(
    (m) => m.offset >= segment.start && m.offset + m.length <= segment.end,
  );
  if (!selected.length) return null;
  const sorted = [...selected].sort((a, b) => a.offset - b.offset);
  let end = segment.start;
  for (const match of sorted) {
    const replacement = match.replacements[0];
    if (
      automatic &&
      (replacement === undefined ||
        /[\r\n]/u.test(match.originalFragment + replacement) ||
        match.originalFragment.replace(/\s/gu, '') !==
          replacement.replace(/\s/gu, ''))
    )
      return null;
    if (
      !Number.isInteger(match.offset) ||
      !Number.isInteger(match.length) ||
      match.length <= 0 ||
      match.offset < end ||
      match.replacements.length === 0 ||
      (automatic && match.replacements.length !== 1) ||
      segment.text.slice(
        match.offset - segment.start,
        match.offset - segment.start + match.length,
      ) !== match.originalFragment ||
      (automatic &&
        ![
          'WHITESPACE_RULE',
          'COMMA_PARENTHESIS_WHITESPACE',
          'CONSECUTIVE_SPACES',
        ].includes(match.ruleId))
    )
      return null;
    end = match.offset + match.length;
  }
  let result = segment.text;
  for (const match of sorted.reverse()) {
    const offset = match.offset - segment.start;
    result =
      result.slice(0, offset) +
      match.replacements[0] +
      result.slice(offset + match.length);
  }
  return result === segment.text ? null : result;
}
export function canTransform(field: EditableField) {
  if (!isEditableField(field)) return false;
  if (field instanceof HTMLInputElement && field.type !== 'text') return false;
  if (
    field.closest(
      '[data-slate-editor], .ProseMirror, .ql-editor, [data-lexical-editor], .monaco-editor, .CodeMirror, pre, code',
    )
  )
    return false;
  const sensitive = [
    field.getAttribute('autocomplete'),
    field.getAttribute('name'),
    field.id,
    field.getAttribute('aria-label'),
  ].join(' ');
  if (
    /(?:password|one-time|otp|credit|cc-|card|cvc|cvv|secret|token|verification|security.?code)/iu.test(
      sensitive,
    )
  )
    return false;
  // Automatic/group edits only support a single text leaf in rich editors.
  return (
    field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement ||
    (field.childNodes.length === 1 && field.firstChild instanceof Text)
  );
}
export function rangeMatch(
  text: string,
  start: number,
  end: number,
): CorrectionMatch {
  return {
    id: 'v4-transaction',
    offset: start,
    length: end - start,
    sourceText: text,
    originalFragment: text.slice(start, end),
    message: '',
    category: 'other',
    replacements: [],
    ruleId: 'V4',
  };
}
export class EditTransaction {
  private busy = false;
  private previous:
    | {
        field: EditableField;
        before: string;
        after: string;
        start: number;
        replacement: string;
        original: string;
      }
    | undefined;
  get active() {
    return this.busy;
  }
  apply(
    field: EditableField,
    expected: string,
    start: number,
    end: number,
    replacement: string,
  ) {
    // Single-line controls strip newlines; rich insertText can create blocks.
    // Refuse before either can change text into an unexpected representation.
    if (
      replacement.includes('\r') ||
      (!(field instanceof HTMLTextAreaElement) && replacement.includes('\n'))
    )
      return false;
    const adapter = createEditorAdapter(field),
      selection = adapter.getSelection();
    if (
      this.busy ||
      !canTransform(field) ||
      !field.isConnected ||
      adapter.getText() !== expected ||
      !selection ||
      selection.start !== selection.end ||
      start < 0 ||
      end > expected.length ||
      start > end ||
      expected.slice(start, end) === replacement
    )
      return false;
    this.busy = true;
    try {
      if (
        !applyReplacement(field, rangeMatch(expected, start, end), replacement)
      )
        return false;
      this.previous = {
        field,
        before: expected,
        after: adapter.getText(),
        start,
        replacement,
        original: expected.slice(start, end),
      };
      return true;
    } finally {
      this.busy = false;
    }
  }
  undo() {
    const previous = this.previous;
    if (!previous) return false;
    const result = this.apply(
      previous.field,
      previous.after,
      previous.start,
      previous.start + previous.replacement.length,
      previous.original,
    );
    this.previous = undefined;
    return result;
  }
}
export function shortcutExpansion(
  text: string,
  caret: number,
  settings: ShortcutSettings,
) {
  if (!settings.enabled || !/[ \u00a0,;:.!?]/u.test(text[caret - 1] ?? ''))
    return null;
  const prefix = text.slice(Math.max(0, caret - 35), caret - 1);
  const token = /(?:^|[\s(«“])([\p{L}\p{M}\p{N}_-]{1,32})$/u.exec(prefix);
  if (!token) return null;
  const value = token[1];
  if (!value) return null;
  const entry = settings.shortcuts.find(
    (s) => s.enabled && normalizeTrigger(s.trigger) === normalizeTrigger(value),
  );
  return entry
    ? {
        start: caret - 1 - value.length,
        end: caret - 1,
        replacement: entry.replacement,
      }
    : null;
}
