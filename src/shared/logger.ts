export const logger = {
  debug(message: string) {
    if (import.meta.env.DEV) console.debug('[Correctly]', message);
  },
  info(message: string) {
    console.info('[Correctly]', message);
  },
  warn(message: string) {
    console.warn('[Correctly]', message);
  },
  error(message: string) {
    console.error('[Correctly]', message);
  },
};
