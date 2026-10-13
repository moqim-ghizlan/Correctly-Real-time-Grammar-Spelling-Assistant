import { debounce } from '../shared/debounce';
import type { Settings } from '../shared/storage';
import type { CheckResult, CorrectionMatch } from '../correction/correction-types';
import type { Language } from '../correction/language';
import { createEditorAdapter } from './editor-adapter';
import { analysisWindow } from './analysis-window';
import { isEditableField } from './field-detector';
import type { FieldState } from './field-state';
export type CheckText = (
  text: string,
  language: Language,
) => Promise<CheckResult>;
export class CorrectionController {
  private windowOffset = 0;
  private timer: ReturnType<typeof debounce>;
  private isReplacing = false;
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
    if (this.isReplacing) return;
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
    if (!this.state.composing) this.timer.schedule();
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
    const next = analysisWindow(
      adapter.getText(),
      adapter.getSelection()?.start ?? 0,
    );
    if (next.offset === this.windowOffset || this.state.composing) return;
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
    if (!isEditableField(state.element) || state.composing) return;
    const text = createEditorAdapter(state.element).getText();
    state.currentText = text;
    const adapter = createEditorAdapter(state.element);
    const window = analysisWindow(text, adapter.getSelection()?.start ?? 0);
    this.windowOffset = window.offset;
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
    this.timer.cancel();
    this.state.requestId++;
    this.state.matches = [];
  }
}
