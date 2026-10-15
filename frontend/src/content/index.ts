import { runInPage, type Intent } from './correction';

// Injected by the worker for the toolbar, shortcuts and context menu; the
// worker then calls correctlyRun(intent, defaultStyles, translationPrefs)
// in this same frame.
(globalThis as { correctlyRun?: unknown }).correctlyRun = (
  intent: Intent,
  styles: string[],
  translation: unknown,
) => runInPage(document, intent, styles, translation);
