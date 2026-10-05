import { CorrectionController, type CheckText } from './correction-controller';
import {
  createFieldState,
  visibleMatches,
  type FieldState,
} from './field-state';
import { isEditableField, type EditableField } from './field-detector';
import { observeFields } from './observers';
import { Highlighter, type Annotation } from './highlighter';
import { SuggestionPopup } from './suggestion-popup';
import { applyReplacement } from './replacement';
import { enabledOnSite, type Settings } from '../shared/storage';
import type { CorrectionMatch } from '../correction/correction-types';
import { sendMessage } from '../shared/messages';
interface Entry {
  state: FieldState;
  controller: CorrectionController;
  highlighter: Highlighter;
  dispose: () => void;
}
export class Application {
  private entries = new Map<EditableField, Entry>();
  private states = new WeakMap<EditableField, FieldState>();
  private popup = new SuggestionPopup();
  private popupField: EditableField | undefined;
  private stopObserver: (() => void) | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private frame = 0;
  private nextId = 0;
  private context: { entry: Entry; match: CorrectionMatch } | undefined;
  private menuSignature = '';
  constructor(
    private settings: Settings,
    private check: CheckText,
  ) {}
  start(root: HTMLElement = document.body) {
    if (!enabledOnSite(this.settings, location.hostname)) return;
    this.stopObserver = observeFields(
      root,
      (field) => this.register(field),
      () => this.prune(),
      this.refreshGeometry,
    );
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(this.refresh);
      for (const field of this.entries.keys())
        this.resizeObserver.observe(field);
    }
    document.addEventListener('scroll', this.refresh, true);
    window.addEventListener('resize', this.refresh);
    document.addEventListener('pointermove', this.pointer, true);
    document.addEventListener('contextmenu', this.contextMenu, true);
    document.addEventListener('focusin', this.focus, true);
  }
  getState(field: EditableField) {
    return this.states.get(field);
  }
  getController(field: EditableField) {
    return this.entries.get(field)?.controller;
  }
  getHighlighter(field: EditableField) {
    return this.entries.get(field)?.highlighter;
  }
  private register(field: EditableField) {
    if (this.entries.has(field)) return;
    const state = createFieldState(field, String(++this.nextId)),
      highlighter = new Highlighter();
    const render = () => {
      highlighter.render(field, state.currentText, visibleMatches(state));
      if (this.popupField === field) this.closePopup();
      if (this.context?.entry.state === state) this.setContext(undefined);
    };
    const controller = new CorrectionController(
      state,
      this.settings,
      this.check,
      render,
    );
    const input = () => controller.changed();
    const compositionStart = () => {
      state.composing = true;
      controller.dispose();
      highlighter.render(field, '', []);
      this.closePopup();
      this.setContext(undefined);
    };
    const compositionEnd = () => {
      state.composing = false;
      controller.changed();
      controller.schedule();
    };
    const click = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const annotation = highlighter.hit(event.clientX, event.clientY);
      if (annotation) this.open(field, annotation);
    };
    field.addEventListener('input', input);
    field.addEventListener('compositionstart', compositionStart);
    field.addEventListener('compositionend', compositionEnd);
    field.addEventListener('click', click);
    const mutation =
      field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement
        ? undefined
        : new MutationObserver(input);
    mutation?.observe(field, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    const dispose = () => {
      controller.dispose();
      highlighter.dispose();
      mutation?.disconnect();
      this.resizeObserver?.unobserve(field);
      field.removeEventListener('input', input);
      field.removeEventListener('compositionstart', compositionStart);
      field.removeEventListener('compositionend', compositionEnd);
      field.removeEventListener('click', click);
    };
    this.entries.set(field, { state, controller, highlighter, dispose });
    this.states.set(field, state);
    this.resizeObserver?.observe(field);
    controller.changed();
  }
  open(field: EditableField, annotation: Annotation) {
    const entry = this.entries.get(field);
    if (!entry) return;
    this.popupField = field;
    this.popup.show(
      annotation.match,
      annotation.rect,
      (replacement) => this.correct(entry, annotation.match, replacement),
      () => entry.controller.ignore(annotation.match.id),
    );
  }
  private closePopup() {
    this.popup.close();
    this.popupField = undefined;
  }
  private correct(entry: Entry, match: CorrectionMatch, replacement: string) {
    this.setContext(undefined);
    if (!applyReplacement(entry.state.element, match, replacement)) {
      entry.controller.changed();
      entry.controller.schedule();
    }
  }
  applyContext() {
    const target = this.context;
    if (
      !target ||
      !target.entry.state.element.isConnected ||
      !isEditableField(target.entry.state.element)
    )
      return;
    const replacement = target.match.replacements[0];
    if (replacement !== undefined)
      this.correct(target.entry, target.match, replacement);
  }
  private focus = (event: FocusEvent) => {
    if (
      event
        .composedPath()
        .some(
          (node) =>
            node instanceof HTMLElement &&
            node.hasAttribute('data-correctly-ui'),
        )
    )
      return;
    this.closePopup();
    this.setContext(undefined);
    if (event.target instanceof HTMLElement)
      this.entries.get(event.target)?.controller.changed();
  };
  private pointer = (event: PointerEvent) => {
    this.findContext(event.target, event.clientX, event.clientY);
  };
  private contextMenu = (event: MouseEvent) => {
    this.menuSignature = 'refresh';
    this.findContext(event.target, event.clientX, event.clientY);
  };
  private findContext(target: EventTarget | null, x: number, y: number) {
    for (const [field, entry] of this.entries) {
      if (!(target instanceof Node) || !field.contains(target)) continue;
      const hit = entry.highlighter.hit(x, y);
      if (hit && hit.match.replacements.length) {
        this.setContext({ entry, match: hit.match });
        return;
      }
    }
    this.setContext(undefined);
  }
  private setContext(context: typeof this.context) {
    this.context = context;
    const signature = context ? context.entry.state.id + context.match.id : '';
    if (signature === this.menuSignature) return;
    this.menuSignature = signature;
    void sendMessage({
      type: 'context',
      fieldId: context?.entry.state.id ?? null,
      offset: context?.match.offset,
      suggestion: context?.match.replacements[0],
    }).catch(() => {});
  }
  private refresh = () => {
    this.closePopup();
    this.refreshGeometry();
  };
  private refreshGeometry = () => {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      for (const [field, entry] of this.entries)
        if (entry.state.matches.length)
          entry.highlighter.render(
            field,
            entry.state.currentText,
            visibleMatches(entry.state),
          );
    });
  };
  private prune() {
    for (const [field, entry] of this.entries)
      if (!field.isConnected || !isEditableField(field)) {
        if (this.context?.entry === entry) this.setContext(undefined);
        entry.dispose();
        this.entries.delete(field);
        this.states.delete(field);
        this.closePopup();
      }
  }
  dispose() {
    this.stopObserver?.();
    this.resizeObserver?.disconnect();
    cancelAnimationFrame(this.frame);
    for (const entry of this.entries.values()) entry.dispose();
    this.entries.clear();
    this.states = new WeakMap();
    this.popup.dispose();
    this.setContext(undefined);
    document.removeEventListener('scroll', this.refresh, true);
    window.removeEventListener('resize', this.refresh);
    document.removeEventListener('pointermove', this.pointer, true);
    document.removeEventListener('contextmenu', this.contextMenu, true);
    document.removeEventListener('focusin', this.focus, true);
  }
}
