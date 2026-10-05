export interface CorrectionMatch {
  id: string;
  offset: number;
  length: number;
  message: string;
  replacements: string[];
  category: 'spelling' | 'grammar' | 'style' | 'other';
  ruleId: string;
  sourceText: string;
  originalFragment: string;
}
export type CheckResult =
  | { status: 'ready'; matches: CorrectionMatch[] }
  | { status: 'unavailable' | 'too-long'; matches: [] };
