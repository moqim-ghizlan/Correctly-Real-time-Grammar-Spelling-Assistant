import { synchronizeUiZoom } from './css-zoom';
import type { CorrectionMatch } from '../correction/correction-types';
import { createUiHost, type Box } from './overlay';
import {
  planSentenceChoices,
  type SentenceChoice,
  type SentenceReview,
} from './v4-editing';
import { createEditorAdapter } from './editor-adapter';
import { isEditableField } from './field-detector';
export function calculatePopupPosition(
  anchor: Box,
  width: number,
  height: number,
  viewportWidth: number,
  viewportHeight: number,
) {
  const margin = 8,
    gap = 6;
  return {
    left: Math.max(
      margin,
      Math.min(anchor.left, viewportWidth - width - margin),
    ),
    top: Math.max(
      margin,
      Math.min(
        anchor.top + anchor.height + gap + height <= viewportHeight - margin
          ? anchor.top + anchor.height + gap
          : anchor.top - height - gap,
        viewportHeight - height - margin,
      ),
    ),
  };
}
export class SuggestionPopup {
  private ui = createUiHost();
  private panel: HTMLDivElement | undefined;
  private previousFocus: HTMLElement | undefined;
  constructor(private onClose: () => void = () => {}) {
    this.ui.host.removeAttribute('aria-hidden');
    document.addEventListener('pointerdown', this.outside, true);
    document.addEventListener('keydown', this.keydown, true);
  }
  private outside = (event: Event) => {
    if (!event.composedPath().includes(this.ui.host)) this.close();
  };
  private keydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape' && this.panel) {
      this.close();
      this.previousFocus?.focus({ preventScroll: true });
    }
  };
  show(
    match: CorrectionMatch,
    anchor: Box,
    replace: (value: string) => void,
    ignore: () => void,
    review: SentenceReview | null = null,
    correctSentence: (choices: SentenceChoice[]) => void = () => {},
    sentenceUnavailable = '',
  ) {
    this.close();
    synchronizeUiZoom(this.ui.host);
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement)
      focused = focused.shadowRoot.activeElement;
    this.previousFocus = focused instanceof HTMLElement ? focused : undefined;
    const editor =
      focused instanceof HTMLElement && isEditableField(focused)
        ? createEditorAdapter(focused)
        : null;
    const savedText = editor?.getText();
    const savedSelection = editor?.getSelection();
    const restoreEditor = () => {
      if (editor && savedSelection && editor.getText() === savedText)
        editor.setSelection(savedSelection);
    };
    const style = document.createElement('style');
    style.textContent =
      ':host{color-scheme:light dark} .panel{box-sizing:border-box;position:fixed;width:300px;max-width:calc(100vw - 16px);max-height:calc(100vh - 16px);overflow:auto;padding:12px;border:1px solid #e5e7eb;border-radius:10px;background:#fff;color:#111827;font:14px system-ui;box-shadow:0 4px 18px #0002;pointer-events:auto} h2{font-size:12px;margin:0 0 8px;color:#6b7280} p{margin:0 0 10px} button{font:inherit;cursor:pointer;border:1px solid #e5e7eb;border-radius:6px;padding:7px 10px;margin:3px;background:#f9fafb;color:#111827} button:hover,button:focus-visible{border-color:#2563eb;outline:2px solid #2563eb} .ignore{display:block;background:none;color:#6b7280}@media(prefers-color-scheme:dark){.panel{background:#111827;color:#f9fafb;border-color:#374151}button{background:#1f2937;color:#f9fafb;border-color:#374151}h2,.ignore{color:#9ca3af}}';
    const panel = document.createElement('div');
    panel.className = 'panel';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Suggestions Correctly');
    const title = document.createElement('h2');
    title.textContent =
      match.category === 'spelling' ? 'Orthographe' : 'Grammaire';
    const message = document.createElement('p');
    message.textContent = match.message;
    panel.append(title, message);
    for (const value of match.replacements.slice(0, 5)) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = value || 'Supprimer';
      button.addEventListener('click', () => {
        restoreEditor();
        this.close();
        replace(value);
      });
      panel.append(button);
    }
    if (review !== null) {
      const scope = document.createElement('p');
      scope.textContent =
        'Phrase courante uniquement. Les suggestions LanguageTool ne garantissent pas une reformulation complète. Vérifiez les noms propres.';
      const changes = document.createElement('fieldset');
      const legend = document.createElement('legend');
      legend.textContent = 'Choisir les corrections de cette phrase';
      changes.append(legend);
      const rows = review.matches.map((candidate) => {
        const row = document.createElement('div');
        const label = document.createElement('label');
        const checked = document.createElement('input');
        checked.type = 'checkbox';
        checked.setAttribute('data-sentence-choice', '');
        label.append(
          checked,
          document.createTextNode(` ${candidate.originalFragment} → `),
        );
        const replacement = document.createElement('select');
        replacement.setAttribute(
          'aria-label',
          `Remplacement de ${candidate.originalFragment}`,
        );
        for (const value of candidate.replacements) {
          const option = document.createElement('option');
          option.value = value;
          option.textContent = value || 'Supprimer';
          replacement.append(option);
        }
        const explanation = document.createElement('small');
        explanation.textContent = candidate.message;
        row.append(label, replacement, explanation);
        changes.append(row);
        return { candidate, checked, replacement };
      });
      const preview = document.createElement('p');
      preview.style.whiteSpace = 'pre-wrap';
      const selectionStatus = document.createElement('p');
      selectionStatus.setAttribute('role', 'status');
      const apply = document.createElement('button');
      apply.type = 'button';
      apply.textContent = 'Corriger cette phrase';
      const selected = () =>
        rows
          .filter((row) => row.checked.checked)
          .map((row) => ({
            match: row.candidate,
            replacement: row.replacement.value,
          }));
      const update = () => {
        const choices = selected();
        const result = planSentenceChoices(review, choices);
        preview.textContent = `Avant : ${review.segment.text}\nAprès : ${result ?? review.segment.text}`;
        apply.disabled = result === null;
        selectionStatus.textContent = !choices.length
          ? 'Aucune modification sélectionnée : les mots sont conservés.'
          : result === null
            ? 'Sélection non applicable : corrections en conflit ou sans changement. Désélectionnez une proposition.'
            : `${choices.length} modification(s) sélectionnée(s). Les propositions non cochées seront conservées.`;
      };
      changes.addEventListener('change', update);
      apply.onclick = () => {
        const choices = selected();
        if (planSentenceChoices(review, choices) === null) return;
        restoreEditor();
        this.close();
        correctSentence(choices);
      };
      panel.append(scope, changes);
      if (review.unavailableCount) {
        const unavailable = document.createElement('p');
        unavailable.textContent = `${review.unavailableCount} proposition(s) sans remplacement applicable, non incluse(s).`;
        panel.append(unavailable);
      }
      panel.append(preview, selectionStatus, apply);
      update();
    } else if (sentenceUnavailable) {
      const reason = document.createElement('p');
      reason.setAttribute('role', 'status');
      reason.textContent = sentenceUnavailable;
      panel.append(reason);
    }
    const ignoreButton = document.createElement('button');
    ignoreButton.type = 'button';
    ignoreButton.className = 'ignore';
    ignoreButton.textContent = 'Ignorer cette erreur';
    ignoreButton.addEventListener('click', () => {
      this.close();
      ignore();
      this.previousFocus?.focus({ preventScroll: true });
    });
    panel.append(ignoreButton);
    this.ui.root.append(style, panel);
    this.panel = panel;
    panel.addEventListener('pointerdown', (event) => {
      // Buttons preserve the editor caret. Choice controls need their native
      // pointer behavior; restore the saved editor selection before applying.
      if (
        event.pointerType === 'mouse' &&
        !(event.target instanceof HTMLInputElement) &&
        !(event.target instanceof HTMLSelectElement) &&
        !(event.target instanceof HTMLLabelElement)
      )
        event.preventDefault();
    });
    const bounds = panel.getBoundingClientRect();
    const position = calculatePopupPosition(
      anchor,
      bounds.width || 300,
      bounds.height || 180,
      window.innerWidth,
      window.innerHeight,
    );
    panel.style.left = position.left + 'px';
    panel.style.top = position.top + 'px';
  }
  close() {
    const wasOpen = !!this.panel;
    this.ui.root.replaceChildren();
    this.panel = undefined;
    if (wasOpen) this.onClose();
  }
  dispose() {
    this.close();
    document.removeEventListener('pointerdown', this.outside, true);
    document.removeEventListener('keydown', this.keydown, true);
    this.ui.host.remove();
  }
}
