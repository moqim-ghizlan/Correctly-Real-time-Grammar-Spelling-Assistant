import type { CheckResult } from '../correction/correction-types';
import type { Language } from '../correction/language';
export type RequestMessage =
  | { type: 'check'; text: string; language: Language }
  | {
      type: 'context';
      fieldId: string | null;
      offset?: number;
      suggestion?: string;
    }
  | { type: 'apply-context' }
  | { type: 'health' };
export async function sendMessage<T>(message: RequestMessage): Promise<T> {
  const response: unknown = await chrome.runtime.sendMessage(message);
  return response as T;
}
export async function checkViaBackground(
  text: string,
  language: Language,
): Promise<CheckResult> {
  return sendMessage<CheckResult>({ type: 'check', text, language });
}
