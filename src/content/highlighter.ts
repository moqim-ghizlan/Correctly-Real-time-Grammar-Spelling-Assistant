import { synchronizeUiZoom } from './css-zoom';
import type { CorrectionMatch } from '../correction/correction-types';
import type { EditableField } from './field-detector';
import {
  createUiHost,
  intersectRect,
  mirrorField,
  visibleFieldBox,
  type Box,
} from './overlay';
import { getEditableTextModel, rangeFromModel } from './text-extractor';
export interface Annotation {
  match: CorrectionMatch;
  rect: Box;
}
export class Highlighter {
  private ui = createUiHost();
  annotations: Annotation[] = [];
  render(field: EditableField, text: string, matches: CorrectionMatch[]) {
    synchronizeUiZoom(this.ui.host);
    this.ui.root.replaceChildren();
    this.annotations = [];
    if (
      !matches.length ||
      !field.isConnected ||
      getComputedStyle(field).visibility === 'hidden'
    )
      return;
    const box = visibleFieldBox(field);
    if (!box) return;
    if (
      field instanceof HTMLInputElement ||
      field instanceof HTMLTextAreaElement
    ) {
      const container = document.createElement('div');
      this.ui.root.append(container);
      const markers = mirrorField(field, text, matches, container);
      for (const match of matches)
        for (const part of markers.get(match.id)?.children ?? []) {
          const rect = part.getBoundingClientRect();
          const clipped = intersectRect(rect, box);
          if (clipped) this.add(match, clipped);
        }
    } else {
      const model = getEditableTextModel(field);
      for (const match of matches) {
        const range = rangeFromModel(model, match.offset, match.length);
        if (!range || typeof range.getClientRects !== 'function') continue;
        for (const rect of range.getClientRects()) {
          const clipped = intersectRect(
            {
              left: rect.left,
              top: rect.top,
              width: Math.max(3, rect.width),
              height: rect.height,
            },
            box,
          );
          if (clipped) this.add(match, clipped);
        }
      }
    }
  }
  private add(match: CorrectionMatch, rect: Box) {
    this.annotations.push({ match, rect });
    const line = document.createElement('div');
    line.style.cssText =
      'position:fixed;pointer-events:none;height:0;border-bottom:2px dotted;';
    Object.assign(line.style, {
      left: rect.left + 'px',
      top: rect.top + rect.height - 2 + 'px',
      width: Math.max(3, rect.width) + 'px',
      borderColor: match.category === 'spelling' ? '#dc2626' : '#d97706',
    });
    this.ui.root.append(line);
  }
  hit(x: number, y: number): Annotation | undefined {
    return this.annotations.find(
      ({ rect }) =>
        x >= rect.left &&
        x <= rect.left + rect.width &&
        y >= rect.top &&
        y <= rect.top + rect.height,
    );
  }
  dispose() {
    this.ui.host.remove();
    this.annotations = [];
  }
}
