import type { EditableField } from './field-detector';
export interface TextPoint {
  node: Node;
  offset: number;
}
export interface TextModel {
  text: string;
  points: TextPoint[];
}
const BLOCKS = new Set([
  'DIV',
  'P',
  'LI',
  'H1',
  'H2',
  'H3',
  'BLOCKQUOTE',
  'PRE',
]);
export function getEditableTextModel(root: HTMLElement): TextModel {
  let text = '';
  const points: TextPoint[] = [];
  const append = (value: string, start: TextPoint, end: TextPoint) => {
    points[text.length] ??= start;
    text += value;
    points[text.length] = end;
  };
  const visit = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const value = node.textContent ?? '';
      for (let i = 0; i < value.length; i++)
        append(value[i] ?? '', { node, offset: i }, { node, offset: i + 1 });
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    if (node !== root && node.getAttribute('contenteditable') === 'false')
      return;
    if (['SCRIPT', 'STYLE'].includes(node.tagName)) return;
    if (node.tagName === 'BR') {
      const parent = node.parentNode;
      if (parent) {
        const i = [...parent.childNodes].indexOf(node);
        append(
          '\n',
          { node: parent, offset: i },
          { node: parent, offset: i + 1 },
        );
      }
      return;
    }
    for (const child of node.childNodes) {
      if (
        child instanceof HTMLElement &&
        BLOCKS.has(child.tagName) &&
        text &&
        !text.endsWith('\n')
      ) {
        const i = [...node.childNodes].indexOf(child);
        append('\n', { node, offset: i }, { node: child, offset: 0 });
      }
      visit(child);
      if (
        child instanceof HTMLElement &&
        BLOCKS.has(child.tagName) &&
        child.nextSibling &&
        !text.endsWith('\n')
      ) {
        const i = [...node.childNodes].indexOf(child);
        append(
          '\n',
          { node: child, offset: child.childNodes.length },
          { node, offset: i + 1 },
        );
      }
    }
  };
  visit(root);
  points[0] ??= { node: root, offset: 0 };
  return { text, points };
}
export function getTextFromField(field: EditableField): string {
  return field instanceof HTMLInputElement ||
    field instanceof HTMLTextAreaElement
    ? field.value
    : getEditableTextModel(field).text;
}
export function rangeFromModel(
  model: TextModel,
  offset: number,
  length: number,
): Range | undefined {
  let start = model.points[offset];
  const end = model.points[offset + length];
  const firstCharacterEnd = length > 0 ? model.points[offset + 1] : undefined;
  // At an inline boundary, prefer the text node containing the first character
  // rather than the preceding text node's end (which would cross markup).
  if (firstCharacterEnd?.node instanceof Text && firstCharacterEnd.offset > 0)
    start = {
      node: firstCharacterEnd.node,
      offset: firstCharacterEnd.offset - 1,
    };
  if (!start || !end) return;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset);
  return range;
}
