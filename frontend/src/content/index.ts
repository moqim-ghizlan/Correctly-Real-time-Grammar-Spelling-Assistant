import { runInPage, type Intent } from './correction';
import { openModal } from './modal';

// Injected by the worker for the toolbar, shortcuts, context menu and the
// right-edge handle; the worker then calls
// correctlyRun(intent, defaultStyles, translationPrefs, rewriteEnabled)
// in this same frame. 'open' shows the V5.11 modal; the other intents keep
// the V5.2–V5.5 context-menu and per-action shortcut panels.
(globalThis as { correctlyRun?: unknown }).correctlyRun = (
  intent: Intent | 'open',
  styles: string[],
  translation: unknown,
  rewriteEnabled: unknown,
) => {
  if (intent === 'open')
    openModal(document, {
      styles,
      translation,
      rewriteEnabled: rewriteEnabled !== false,
    });
  else runInPage(document, intent, styles, translation);
};
