import { installHandle } from './handle';
import { installShortcutExpander, requestPageConfig } from './shortcuts';

// Registered on all sites only after the user enabled the Correctly handle
// or text shortcuts and granted the optional site access in the settings.
// The worker says which of the two is on (and which shortcuts are active).
installShortcutExpander(document);
void requestPageConfig().then((config) => {
  if (config.smartButton) installHandle(document, config.handleY);
});
