import type { CheckResult } from '../correction/correction-types';
import type { Language } from '../correction/language';
import { logger } from './logger';
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
let unavailableReported = false;
function reportUnavailable(reason: string) {
  if (!unavailableReported) logger.warn(reason);
  unavailableReported = true;
}
export async function checkViaBackground(
  text: string,
  language: Language,
): Promise<CheckResult> {
  try {
    const result = await sendMessage<CheckResult>({
      type: 'check',
      text,
      language,
    });
    if (result.status === 'unavailable')
      reportUnavailable(
        result.reason ??
          'Analyse indisponible. Vérifiez LanguageTool et la console du service worker Correctly.',
      );
    else if (result.status === 'ready') unavailableReported = false;
    return result;
  } catch {
    const reason =
      'Impossible de communiquer avec Correctly. Rechargez l’extension puis cette page.';
    reportUnavailable(reason);
    return { status: 'unavailable', matches: [], reason };
  }
}
