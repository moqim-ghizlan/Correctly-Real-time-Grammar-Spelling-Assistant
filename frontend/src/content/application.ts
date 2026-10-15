import { CorrectionController, type CheckText } from './correction-controller';
import {
  createFieldState,
  visibleMatches,
  type FieldState,
} from './field-state';
import {
  findEditableElement,
  isInsideCorrectlyUI,
  isEditableField,
  type EditableField,
} from './field-detector';
import { observeFields } from './observers';
import { Highlighter, type Annotation } from './highlighter';
import { SuggestionPopup } from './suggestion-popup';
import { type Settings } from '../shared/storage';
import type { CorrectionMatch } from '../correction/correction-types';
import { sendMessage } from '../shared/messages';
import { EMPTY_SHORTCUTS, type ShortcutSettings } from '../shared/shortcuts';
import { createUiHost } from './overlay';
import { createEditorAdapter } from './editor-adapter';
interface Entry {
  state: FieldState;
  controller: CorrectionController;
  highlighter: Highlighter;
  dispose: () => void;
}
export class Application {
  private activeEditor: EditableField | null = null;
  private entries = new Map<EditableField, Entry>();
  private states = new WeakMap<EditableField, FieldState>();
  private popup = new SuggestionPopup(() => {
    this.popupField = undefined;
  });
  private popupField: EditableField | undefined;
  private stopObserver: (() => void) | undefined;
  private resizeObserver: ResizeObserver | undefined;
  private frame = 0;
  private nextId = 0;
  private context: { entry: Entry; match: CorrectionMatch } | undefined;
  private menuSignature = '';
  private undoUi: ReturnType<typeof createUiHost> | undefined;
  private statusUi: ReturnType<typeof createUiHost> | undefined;
  private replacingSelection = false;
  constructor(
    private settings: Settings,
    private check: CheckText,
    private shortcuts: ShortcutSettings = EMPTY_SHORTCUTS,
  ) {}
  start(root: HTMLElement = document.body) {
    if (
      this.settings.disabledSites.includes(location.hostname) ||
      (!this.settings.enabled && !this.shortcuts.enabled)
    )
      return;
    this.stopObserver = observeFields(
      root === document.body ? document.documentElement : root,
      () => this.prune(),
      this.refresh,
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
    for (const type of [
      'focusin',
      'beforeinput',
      'input',
      'compositionstart',
      'compositionend',
    ])
      document.addEventListener(type, this.interaction, true);
    document.addEventListener('selectionchange', this.selectionChanged);
    document.addEventListener('visibilitychange', this.visibilityChanged);
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement)
      focused = focused.shadowRoot.activeElement;
    this.activate(findEditableElement(focused ?? document.body));
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
    controller.setUndoNotice(() => this.showUndo(controller));
    const click = (event: Event) => {
      if (!(event instanceof MouseEvent)) return;
      const annotation = highlighter.hit(event.clientX, event.clientY);
      if (annotation) this.open(field, annotation);
    };
    field.addEventListener('click', click);
    const tree = field.getRootNode();
    if (tree instanceof ShadowRoot)
      tree.addEventListener('scroll', this.refresh, true);
    if (tree instanceof ShadowRoot)
      tree.addEventListener('selectionchange', this.selectionChanged);
    const mutation = new MutationObserver(() => {
      this.prune();
      if (this.activeEditor === field) input();
      this.refresh();
    });
    mutation.observe(tree instanceof ShadowRoot ? tree : field, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'contenteditable',
        'type',
        'disabled',
        'readonly',
        'class',
        'style',
        'hidden',
      ],
    });
    const dispose = () => {
      controller.dispose();
      highlighter.dispose();
      mutation.disconnect();
      if (tree instanceof ShadowRoot)
        tree.removeEventListener('scroll', this.refresh, true);
      if (tree instanceof ShadowRoot)
        tree.removeEventListener('selectionchange', this.selectionChanged);
      this.resizeObserver?.unobserve(field);
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
    this.popup.show(
      annotation.match,
      annotation.rect,
      (replacement) => this.correct(entry, annotation.match, replacement),
      () => entry.controller.ignore(annotation.match.id),
      entry.controller.sentenceReview(annotation.match),
      (choices) => {
        if (!entry.controller.correctSentence(annotation.match, choices))
          this.editRefused(entry, annotation.match);
      },
      entry.controller.sentenceUnavailableReason(annotation.match),
    );
    this.popupField = field;
  }
  private closePopup() {
    this.popup.close();
    this.popupField = undefined;
  }
  private correct(entry: Entry, match: CorrectionMatch, replacement: string) {
    this.setContext(undefined);
    this.closePopup();
    if (!entry.controller.replaceMatch(match, replacement))
      this.editRefused(entry, match);
  }
  private editRefused(entry: Entry, match: CorrectionMatch) {
    this.statusUi?.host.remove();
    this.statusUi = createUiHost();
    this.statusUi.host.removeAttribute('aria-hidden');
    const notice = document.createElement('p');
    notice.setAttribute('role', 'status');
    notice.textContent =
      createEditorAdapter(entry.state.element).getText() !== match.sourceText
        ? 'Correction non appliquée : résultat périmé. Attendez une nouvelle analyse.'
        : 'Correction non appliquée : le champ ou sa sélection ne permet pas cette modification.';
    notice.style.cssText =
      'position:fixed;bottom:64px;right:16px;padding:12px;background:white;color:black;border:2px solid #2563eb;border-radius:8px;font:14px system-ui;max-width:360px';
    this.statusUi.root.append(notice);
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
  private activate(field: EditableField | null) {
    if (field === this.activeEditor) return;
    this.undoUi?.host.remove();
    this.statusUi?.host.remove();
    this.closePopup();
    this.setContext(undefined);
    if (this.activeEditor) {
      this.entries.get(this.activeEditor)?.dispose();
      this.entries.delete(this.activeEditor);
      this.states.delete(this.activeEditor);
    }
    this.activeEditor = field;
    if (field) this.register(field);
  }
  private interaction = (event: Event) => {
    if (
      event
        .composedPath()
        .some((node) => node instanceof Node && isInsideCorrectlyUI(node))
    )
      return;
    const field = findEditableElement(event);
    this.activate(field);
    if (!field) return;
    const entry = this.entries.get(field)!;
    if (entry.controller.transaction.active) return;
    if (event.type === 'beforeinput') {
      const selection = createEditorAdapter(field).getSelection();
      this.replacingSelection =
        !!selection && selection.start !== selection.end;
    }
    if (event.type === 'compositionstart') {
      entry.state.composing = true;
      entry.controller.dispose();
      entry.highlighter.render(field, '', []);
      this.closePopup();
    } else if (event.type === 'compositionend') {
      entry.state.composing = false;
      entry.controller.changed();
      entry.controller.schedule();
    } else if (event.type === 'input') {
      this.statusUi?.host.remove();
      if (event instanceof InputEvent && event.isComposing) {
        entry.state.composing = true;
        entry.controller.dispose();
      }
      if (event instanceof InputEvent)
        entry.controller.typed(event, this.shortcuts, this.replacingSelection);
      this.replacingSelection = false;
      entry.controller.changed();
    }
  };
  private visibilityChanged = () => {
    for (const entry of this.entries.values()) {
      if (document.visibilityState === 'hidden') entry.controller.dispose();
      else entry.controller.schedule();
    }
  };
  private showUndo(controller: CorrectionController) {
    this.undoUi?.host.remove();
    this.undoUi = createUiHost();
    this.undoUi.host.removeAttribute('aria-hidden');
    const button = document.createElement('button');
    button.textContent = 'Annuler la modification Correctly';
    button.style.cssText =
      'position:fixed;bottom:16px;right:16px;pointer-events:auto;padding:10px;background:white;color:black;border:2px solid #2563eb;border-radius:8px;font:14px system-ui';
    button.addEventListener('pointerdown', (event) => event.preventDefault());
    button.onclick = () => {
      if (controller.undo()) this.undoUi?.host.remove();
      else button.textContent = 'Annulation indisponible : texte modifié';
    };
    this.undoUi.root.append(button);
  }
  private selectionChanged = () => {
    const tree = this.activeEditor?.getRootNode();
    const selection =
      (
        tree as
          (ShadowRoot & { getSelection?: () => Selection | null }) | undefined
      )?.getSelection?.() ?? document.getSelection();
    const node = selection?.anchorNode;
    if (node && isInsideCorrectlyUI(node)) return;
    if (this.popupField) return;
    let focused = document.activeElement;
    while (focused?.shadowRoot?.activeElement)
      focused = focused.shadowRoot.activeElement;
    if (focused && isInsideCorrectlyUI(focused)) return;
    const field =
      focused instanceof HTMLInputElement ||
      focused instanceof HTMLTextAreaElement
        ? findEditableElement(focused)
        : node
          ? findEditableElement(node)
          : null;
    if (field) {
      this.activate(field);
      this.entries.get(field)?.controller.selectionChanged();
    }
    this.refreshGeometry();
  };
  private pointer = (event: PointerEvent) => {
    this.findContext(
      event.composedPath()[0] ?? event.target,
      event.clientX,
      event.clientY,
    );
  };
  private contextMenu = (event: MouseEvent) => {
    this.menuSignature = 'refresh';
    this.findContext(
      event.composedPath()[0] ?? event.target,
      event.clientX,
      event.clientY,
    );
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
    this.setContext(undefined);
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
        if (this.activeEditor === field) this.activeEditor = null;
        this.entries.delete(field);
        this.states.delete(field);
        this.closePopup();
      }
  }
  dispose() {
    this.statusUi?.host.remove();
    this.undoUi?.host.remove();
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
    for (const type of [
      'focusin',
      'beforeinput',
      'input',
      'compositionstart',
      'compositionend',
    ])
      document.removeEventListener(type, this.interaction, true);
    document.removeEventListener('selectionchange', this.selectionChanged);
    document.removeEventListener('visibilitychange', this.visibilityChanged);
    this.activeEditor = null;
  }
}
