import { MAX_TEXT_LENGTH } from '../shared/constants';
// A bounded window centred on the caret, preferring paragraph boundaries.
export function analysisWindow(text: string, caret: number) {
  if (text.length <= MAX_TEXT_LENGTH) return { text, offset: 0 };
  caret = Math.max(0, Math.min(text.length, caret));
  const paragraphStart =
    caret === 0 ? 0 : text.lastIndexOf('\n', caret - 1) + 1;
  const newline = text.indexOf('\n', caret);
  const paragraphEnd = newline < 0 ? text.length : newline;
  if (paragraphEnd - paragraphStart <= MAX_TEXT_LENGTH)
    return {
      text: text.slice(paragraphStart, paragraphEnd),
      offset: paragraphStart,
    };
  let start = Math.max(paragraphStart, caret - Math.floor(MAX_TEXT_LENGTH / 2));
  const end = Math.min(paragraphEnd, start + MAX_TEXT_LENGTH);
  start = Math.max(paragraphStart, end - MAX_TEXT_LENGTH);
  // Avoid slicing a UTF-16 surrogate pair.
  if (start > 0 && /[\uDC00-\uDFFF]/.test(text[start]!)) start++;
  let stop = end;
  if (stop < text.length && /[\uDC00-\uDFFF]/.test(text[stop]!)) stop--;
  return { text: text.slice(start, stop), offset: start };
}
