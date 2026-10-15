import {
  isTestConnectionRequest,
  type ConnectionResult,
} from '../shared/contracts';
import { errorMessage, isRetryable } from '../shared/errors';
import { browserStorage } from '../shared/storage';
import { ConnectionController } from './connection-controller';

// No logging here on purpose: nothing in this worker should ever print a
// key, a request or a provider response.

/** Only pages bundled in this extension may talk to the worker. */
export function isTrustedSender(
  sender: chrome.runtime.MessageSender,
  runtimeId: string,
  extensionOrigin: string,
): boolean {
  if (sender.id !== runtimeId) return false;
  const url = typeof sender.url === 'string' ? sender.url : '';
  return url.startsWith(extensionOrigin);
}

export function registerServiceWorker(
  controller = new ConnectionController({ area: browserStorage() }),
): void {
  const extensionOrigin = chrome.runtime.getURL('');

  chrome.runtime.onMessage.addListener((message: unknown, sender, reply) => {
    if (
      !isTrustedSender(sender, chrome.runtime.id, extensionOrigin) ||
      !isTestConnectionRequest(message)
    )
      return false;
    void controller
      .testConnection()
      .catch((): ConnectionResult => ({
        ok: false,
        code: 'UNKNOWN_ERROR',
        message: errorMessage('UNKNOWN_ERROR'),
        retryable: isRetryable('UNKNOWN_ERROR'),
      }))
      .then(reply);
    return true;
  });

  chrome.action.onClicked.addListener(() => {
    void chrome.runtime.openOptionsPage();
  });
}
