import { isLocale } from '../shared/locale';
import { runInPage, type Intent } from './correction';
import { openModal } from './modal';

// Injected by the worker for the toolbar, shortcuts, context menu and the
// right-edge handle; the worker then calls
// correctlyRun(intent, defaultStyles, translationPrefs, rewriteEnabled, locale,
// formality)
// in this same frame. 'open' shows the V5.11 modal; the other intents keep
// the V5.2–V5.5 context-menu and per-action shortcut panels. 5.13: `locale`
// is the interface language chosen in the settings (English if unknown);
// `formality` is the custom-formality slider's starting level.
(globalThis as { correctlyRun?: unknown }).correctlyRun = (
  intent: Intent | 'open',
  styles: string[],
  translation: unknown,
  rewriteEnabled: unknown,
  locale?: unknown,
  formality?: unknown,
) => {
  const language = isLocale(locale) ? locale : 'en';
  if (intent === 'open')
    openModal(document, {
      styles,
      translation,
      rewriteEnabled: rewriteEnabled !== false,
      locale: language,
      formality,
    });
  else runInPage(document, intent, styles, translation, language, formality);
};
