import { debounce } from '../shared/debounce';
import type { Settings } from '../shared/storage';
import type {
  CheckResult,
  CorrectionMatch,
} from '../correction/correction-types';
import type { Language } from '../correction/language';
import { createEditorAdapter } from './editor-adapter';
import { analysisWindow } from './analysis-window';
import { isEditableField } from './field-detector';
import type { FieldState } from './field-state';
import {
  EditTransaction,
  planSentence,
  planSentenceChoices,
  type SentenceChoice,
  type SentenceReview,
  sentenceAt,
  sentenceContaining,
  shortcutExpansion,
  canTransform,
} from './v4-editing';
import type { ShortcutSettings } from '../shared/shortcuts';
export type CheckText = (
  text: string,
  language: Language,
) => Promise<CheckResult>;
export class CorrectionController {
  private windowOffset = 0;
  private windowEnd = 0;
  private timer: ReturnType<typeof debounce>;
  private isReplacing = false;
  readonly transaction = new EditTransaction();
  private autoBoundary = false;
  private undoNotice: (() => void) | undefined;
  private requestSelection: { start: number; end: number } | null = null;
  setUndoNotice(notice: () => void) {
    this.undoNotice = notice;
  }
  typed(event: InputEvent, shortcuts: ShortcutSettings, hadSelection = false) {
    if (
      this.isReplacing ||
      this.transaction.active ||
      this.state.composing ||
      event.isComposing
    )
      return;
    this.autoBoundary = false;
    if (hadSelection) return;
    if (
      event.inputType !== 'insertText' ||
      !event.data ||
      event.data.length !== 1
    )
      return;
    const adapter = createEditorAdapter(this.state.element),
      selection = adapter.getSelection();
    if (!selection || selection.start !== selection.end) return;
    const text = adapter.getText();
    const expansion = shortcutExpansion(text, selection.start, shortcuts);
    if (
      expansion &&
      this.transaction.apply(
        this.state.element,
        text,
        expansion.start,
        expansion.end,
        expansion.replacement,
      )
    )
      this.undoNotice?.();
    const caret = adapter.getSelection()?.start ?? 0;
    this.autoBoundary =
      this.settings.sentenceCorrection &&
      sentenceAt(adapter.getText(), caret).complete;
  }
  sentenceReview(match: CorrectionMatch): SentenceReview | null {
    if (!this.settings.sentenceCorrection || !canTransform(this.state.element))
      return null;
    if (
      createEditorAdapter(this.state.element).getText() !==
        this.state.sourceText ||
      !this.state.matches.includes(match) ||
      this.state.status !== 'ready'
    )
      return null;
    const segment = sentenceContaining(this.state.sourceText, match.offset);
    if (!segment || match.offset < segment.start || match.offset >= segment.end)
      return null;
    const candidates = this.state.matches.filter(
      (m) =>
        !this.state.ignoredMatches.has(m.id) &&
        m.offset >= segment.start &&
        m.offset + m.length <= segment.end,
    );
    const matches = candidates.filter(
      (m) => m.length > 0 && m.replacements.length > 0,
    );
    return matches.length
      ? {
          segment,
          matches,
          unavailableCount: candidates.length - matches.length,
        }
      : null;
  }
  sentencePreview(match: CorrectionMatch, choices: SentenceChoice[] = []) {
    const review = this.sentenceReview(match);
    return review ? planSentenceChoices(review, choices) : null;
  }
  sentenceUnavailableReason(match: CorrectionMatch) {
    if (!this.settings.sentenceCorrection)
      return 'Correction par phrase désactivée dans les paramètres.';
    if (!canTransform(this.state.element))
      return 'Correction groupée indisponible : éditeur non pris en charge.';
    if (
      createEditorAdapter(this.state.element).getText() !==
        this.state.sourceText ||
      !this.state.matches.includes(match) ||
      this.state.status !== 'ready'
    )
      return 'Résultat périmé : attendre une nouvelle analyse.';
    if (!sentenceContaining(this.state.sourceText, match.offset))
      return 'Correction groupée indisponible : phrase tronquée ou trop longue.';
    return 'Aucune correction groupable : propositions absentes ou en conflit.';
  }
  correctSentence(match: CorrectionMatch, choices: SentenceChoice[] = []) {
    const replacement = this.sentencePreview(match, choices),
      segment = sentenceContaining(this.state.sourceText, match.offset);
    if (
      replacement === null ||
      !segment ||
      !this.transaction.apply(
        this.state.element,
        this.state.sourceText,
        segment.start,
        segment.end,
        replacement,
      )
    )
      return false;
    this.autoBoundary = false;
    this.changed();
    this.undoNotice?.();
    return true;
  }
  undo() {
    const ok = this.transaction.undo();
    this.autoBoundary = false;
    this.changed();
    return ok;
  }
  constructor(
    readonly state: FieldState,
    private settings: Settings,
    private check: CheckText,
    private render: () => void,
  ) {
    this.timer = debounce(() => {
      void this.analyze();
    }, settings.debounceMs);
  }
  changed() {
    if (this.isReplacing || this.transaction.active) return;
    if (!isEditableField(this.state.element)) {
      this.dispose();
      return;
    }
    const text = createEditorAdapter(this.state.element).getText();
    if (text === this.state.currentText) return;
    this.state.currentText = text;
    this.state.requestId++;
    this.state.matches = [];
    this.state.ignoredMatches.clear();
    this.state.status = 'idle';
    this.render();
    this.timer.cancel();
    if (!this.state.composing && this.settings.enabled) this.timer.schedule();
  }
  replaceMatch(match: CorrectionMatch, replacement: string): boolean {
    if (!isEditableField(this.state.element)) {
      this.dispose();
      return false;
    }
    const adapter = createEditorAdapter(this.state.element);
    this.isReplacing = true;
    let replaced: boolean;
    try {
      replaced = adapter.replaceRange(match, replacement);
    } finally {
      this.isReplacing = false;
    }
    if (!replaced) {
      this.changed();
      this.schedule();
      return false;
    }
    const text = adapter.getText();
    this.state.currentText = text;
    this.state.sourceText = text;
    const delta = replacement.length - match.length;
    const matchStart = match.offset;
    const matchEnd = match.offset + match.length;

    this.state.matches = this.state.matches
      .filter((m) => {
        const mEnd = m.offset + m.length;
        const overlaps =
          Math.max(m.offset, matchStart) < Math.min(mEnd, matchEnd);
        return m.id !== match.id && !overlaps;
      })
      .map((m) => {
        if (m.offset >= matchEnd) {
          return {
            ...m,
            offset: m.offset + delta,
            sourceText: text,
          };
        }
        return {
          ...m,
          sourceText: text,
        };
      });

    this.render();
    this.timer.cancel();
    void this.analyze();
    return true;
  }
  selectionChanged() {
    const adapter = createEditorAdapter(this.state.element);
    const selection = adapter.getSelection();
    if (
      this.state.status === 'checking' &&
      (selection?.start !== this.requestSelection?.start ||
        selection?.end !== this.requestSelection?.end)
    ) {
      this.autoBoundary = false;
      this.state.requestId++;
      this.state.status = 'idle';
      this.timer.schedule();
    }
    if (this.state.composing) return;
    // Valid matches remain usable while the caret stays in the checked text.
    // The analysis window can be a sentence rather than a whole paragraph.
    if (
      selection &&
      selection.start >= this.windowOffset &&
      selection.end <= this.windowEnd
    )
      return;
    const next = analysisWindow(
      adapter.getText(),
      adapter.getSelection()?.start ?? 0,
    );
    if (
      next.offset === this.windowOffset &&
      next.offset + next.text.length === this.windowEnd
    )
      return;
    this.windowOffset = next.offset;
    this.state.requestId++;
    this.state.matches = [];
    this.state.ignoredMatches.clear();
    this.render();
    this.timer.schedule();
  }
  schedule() {
    this.timer.schedule();
  }
  async analyze() {
    const state = this.state;
    if (
      !this.settings.enabled ||
      !isEditableField(state.element) ||
      state.composing
    )
      return;
    const text = createEditorAdapter(state.element).getText();
    state.currentText = text;
    const adapter = createEditorAdapter(state.element);
    const selection = adapter.getSelection();
    this.requestSelection = selection;
    const segment = sentenceAt(text, selection?.start ?? text.length);
    const window =
      this.settings.sentenceCorrection && segment.complete
        ? { text: segment.text, offset: segment.start }
        : analysisWindow(text, selection?.start ?? 0);
    const automatic = this.autoBoundary;
    this.autoBoundary = false;
    this.windowOffset = window.offset;
    this.windowEnd = window.offset + window.text.length;
    const requestId = ++state.requestId;
    state.status = 'checking';
    try {
      const result = await this.check(window.text, this.settings.language);
      if (
        requestId !== state.requestId ||
        createEditorAdapter(state.element).getText() !== text ||
        !state.element.isConnected ||
        !isEditableField(state.element)
      )
        return;
      state.sourceText = text;
      state.status = result.status;
      state.matches = result.matches
        .filter(
          (match) =>
            Number.isInteger(match.offset) &&
            Number.isInteger(match.length) &&
            match.offset >= 0 &&
            match.length >= 0 &&
            match.offset + match.length <= window.text.length &&
            window.text.slice(match.offset, match.offset + match.length) ===
              match.originalFragment,
        )
        .map((match) => ({
          ...match,
          offset: match.offset + window.offset,
          sourceText: text,
        }))
        .filter((match) => {
          if (match.category === 'spelling')
            return (
              this.settings.spellingEnabled &&
              !this.settings.customDictionary.includes(match.originalFragment)
            );
          return match.category === 'grammar' && this.settings.grammarEnabled;
        });
      const currentSelection = adapter.getSelection();
      let focused = document.activeElement;
      while (focused?.shadowRoot?.activeElement)
        focused = focused.shadowRoot.activeElement;
      const planned =
        automatic && canTransform(state.element)
          ? planSentence(segment, state.matches, true)
          : null;
      if (
        planned !== null &&
        document.visibilityState !== 'hidden' &&
        focused === state.element &&
        !state.composing &&
        selection &&
        currentSelection?.start === selection.start &&
        currentSelection.end === selection.end &&
        this.transaction.apply(
          state.element,
          text,
          segment.start,
          segment.end,
          planned,
        )
      ) {
        this.changed();
        this.undoNotice?.();
        return;
      }
    } catch {
      if (requestId !== state.requestId) return;
      state.status = 'unavailable';
      state.matches = [];
    }
    this.render();
  }
  ignore(id: string) {
    this.state.ignoredMatches.add(id);
    this.render();
  }
  dispose() {
    this.autoBoundary = false;
    this.timer.cancel();
    this.state.requestId++;
    this.state.matches = [];
  }
}
