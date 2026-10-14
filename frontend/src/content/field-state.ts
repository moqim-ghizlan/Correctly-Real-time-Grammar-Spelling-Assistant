import type { EditableField } from './field-detector';
import type { CorrectionMatch } from '../correction/correction-types';
export interface FieldState {
  element: EditableField;
  id: string;
  currentText: string;
  sourceText: string;
  matches: CorrectionMatch[];
  ignoredMatches: Set<string>;
  requestId: number;
  status: 'idle' | 'checking' | 'ready' | 'unavailable' | 'too-long';
  composing: boolean;
}
export function createFieldState(
  element: EditableField,
  id: string,
): FieldState {
  return {
    element,
    id,
    currentText: '',
    sourceText: '',
    matches: [],
    ignoredMatches: new Set(),
    requestId: 0,
    status: 'idle',
    composing: false,
  };
}
export function visibleMatches(state: FieldState) {
  return state.matches.filter((match) => !state.ignoredMatches.has(match.id));
}
