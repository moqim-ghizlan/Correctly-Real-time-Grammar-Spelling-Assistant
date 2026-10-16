// V5.6 AI protection: protected shortcut text in the SELECTED text is
// replaced by unpredictable placeholders in the request copy only, then
// restored in each validated candidate. Provider-agnostic and pure.
import { canonical, type ShortcutRecord } from './shortcuts';

const WORD = /[\p{L}\p{M}\p{N}_-]+/gu;

export interface Shield {
  /** Text to send: protected spans replaced by placeholders. */
  text: string;
  count: number;
  /** Extra trusted instruction ('' when nothing is protected). */
  note: string;
  /** The candidate with originals restored, or null if any placeholder was lost, altered, duplicated or invented. */
  restore(candidate: string): string | null;
  /** V5.12: the instruction matching restoreSome ('' when nothing is protected). */
  noteSome: string;
  /**
   * V5.12 summaries may drop protected text: each placeholder at most once,
   * none invented or altered; null otherwise.
   */
  restoreSome(candidate: string): string | null;
}

const randomTag = () => {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return [...bytes]
    .map((byte) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[byte % 32])
    .join('');
};

/**
 * Finds protected occurrences: whole-token triggers (case-insensitive, like
 * expansion) and exact replacement phrases for entries that opted in.
 * Overlaps keep the earliest, then the longest span.
 */
export function protectedSpans(
  text: string,
  entries: readonly ShortcutRecord[],
): { start: number; end: number }[] {
  const triggers = new Set(
    entries
      .filter((e) => e.protectTriggerInAi)
      .map((e) => canonical(e.trigger)),
  );
  const spans: { start: number; end: number }[] = [];
  if (triggers.size)
    for (const match of text.matchAll(WORD))
      if (triggers.has(canonical(match[0])))
        spans.push({ start: match.index, end: match.index + match[0].length });
  for (const entry of entries) {
    if (!entry.protectReplacementInAi) continue;
    for (
      let at = text.indexOf(entry.replacement);
      at !== -1;
      at = text.indexOf(entry.replacement, at + entry.replacement.length)
    )
      spans.push({ start: at, end: at + entry.replacement.length });
  }
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: { start: number; end: number }[] = [];
  for (const span of spans)
    if (!kept.length || span.start >= kept[kept.length - 1]!.end)
      kept.push(span);
  return kept;
}

export function shield(
  text: string,
  entries: readonly ShortcutRecord[],
  tag: () => string = randomTag,
): Shield {
  const spans = protectedSpans(text, entries);
  if (!spans.length)
    return {
      text,
      count: 0,
      note: '',
      noteSome: '',
      restore: (candidate) => candidate,
      restoreSome: (candidate) => candidate,
    };
  let prefix = '';
  // Regenerate until no placeholder-looking text already exists in the source.
  do prefix = `[[${tag()}_`;
  while (text.includes(prefix));
  const originals = new Map<string, string>();
  let masked = '';
  let last = 0;
  spans.forEach((span, index) => {
    const marker = `${prefix}${index + 1}]]`;
    originals.set(marker, text.slice(span.start, span.end));
    masked += text.slice(last, span.start) + marker;
    last = span.end;
  });
  masked += text.slice(last);
  const put = (candidate: string, optional: boolean) => {
    // Every marker of this operation must appear exactly once (summaries:
    // at most once)…
    for (const marker of originals.keys()) {
      const parts = candidate.split(marker).length;
      if (parts > 2 || (parts === 1 && !optional)) return null;
    }
    // …and nothing else may use the namespace (invented or altered markers).
    const stripped = [...originals.keys()].reduce(
      (rest, marker) => rest.split(marker).join(''),
      candidate,
    );
    if (stripped.toUpperCase().includes(prefix.slice(2))) return null;
    let restored = candidate;
    for (const [marker, original] of originals)
      restored = restored.split(marker).join(original);
    return restored;
  };
  return {
    text: masked,
    count: spans.length,
    note: `Placeholders such as ${prefix}1]] are protected text: copy each one exactly once, unchanged; never translate, split, rename or add placeholders.`,
    noteSome: `Placeholders such as ${prefix}1]] are protected text: keep any placeholder you use exactly unchanged and at most once; never translate, split, rename or add placeholders.`,
    restore: (candidate) => put(candidate, false),
    restoreSome: (candidate) => put(candidate, true),
  };
}
