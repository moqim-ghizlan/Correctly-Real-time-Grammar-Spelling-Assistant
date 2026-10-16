import { installHandle } from './handle';
import { installKeyCommands } from './keys';
import { installShortcutExpander, requestPageConfig } from './shortcuts';

// Registered on all sites only after the user enabled the Correctly handle
// text shortcuts or keyboard shortcuts and granted the optional site access.
// The worker says which are on (and which shortcuts and keys are active).
installShortcutExpander(document);
void requestPageConfig().then((config) => {
  if (config.smartButton)
    installHandle(document, config.handleY, undefined, config.locale);
  installKeyCommands(document, config.keybindings);
});
