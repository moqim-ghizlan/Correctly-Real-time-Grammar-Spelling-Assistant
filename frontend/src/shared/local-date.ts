const formatter = () =>
  new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/**
 * Calendar date (YYYY-MM-DD) in the browser's current local timezone.
 * Deliberately not `toISOString().slice(0, 10)`, which is the UTC date.
 * The formatter is created per call so a timezone change is picked up.
 */
export function localDate(date: Date = new Date()): string {
  const parts = formatter().formatToParts(date);
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function isLocalDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}
