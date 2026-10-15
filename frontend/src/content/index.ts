import { correctInPage, NOTICES } from './correction';

// Injected by the worker on every toolbar click, shortcut or context-menu
// click. The worker may leave a notice first (e.g. unreachable frame).
const state = globalThis as { correctlyNotice?: string };
const notice = state.correctlyNotice;
delete state.correctlyNotice;
correctInPage(
  document,
  notice === 'unreachable' ? NOTICES.unreachable : undefined,
);
