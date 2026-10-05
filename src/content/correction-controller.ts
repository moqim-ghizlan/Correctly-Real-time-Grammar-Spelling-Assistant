import { debounce } from '../shared/debounce';
import type { Settings } from '../shared/storage';
import type { CheckResult } from '../correction/correction-types';
import type { Language } from '../correction/language';
import { getTextFromField } from './text-extractor';
import { isEditableField } from './field-detector';
import type { FieldState } from './field-state';
export type CheckText = (
  text: string,
  language: Language,
) => Promise<CheckResult>;
export class CorrectionController {
  private timer: ReturnType<typeof debounce>;
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
    if (!isEditableField(this.state.element)) {
      this.dispose();
      return;
    }
    const text = getTextFromField(this.state.element);
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
  schedule() {
    this.timer.schedule();
  }
  async analyze() {
    const state = this.state;
    if (!isEditableField(state.element) || state.composing) return;
    const text = getTextFromField(state.element);
    state.currentText = text;
    const requestId = ++state.requestId;
    state.status = 'checking';
    try {
      const result = await this.check(text, this.settings.language);
      if (
        requestId !== state.requestId ||
        getTextFromField(state.element) !== text ||
        !state.element.isConnected ||
        !isEditableField(state.element)
      )
        return;
      state.sourceText = text;
      state.status = result.status;
      state.matches = result.matches.filter((match) => {
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
