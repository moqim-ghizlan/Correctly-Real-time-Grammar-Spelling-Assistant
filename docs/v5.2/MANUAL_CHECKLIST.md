# V5.2 manual checklist (owner)

These steps need your key and a real click. Use test sentences, never private
text, and never take a screenshot that shows your key.

## 1. Setup

1. `npm run build`, then go to `chrome://extensions` (or `brave://extensions`)
   and click **Reload** on Correctly (or **Load unpacked** → `dist`).
2. Accept the new permission prompt if one appears (`activeTab`, `scripting`).
3. In the settings, make sure the key is _Connected_, then tick
   **Correction → Send the text I select…**.

## 2. Live correction (required for "fully live-verified")

Open any normal https page with a text box. A simple option is a new
https://www.google.com search page, using a textarea such as a comment field
on a site you control.

| #   | Action                                                                 | Expected                                                      |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------- |
| 1   | Type `Je suis aller a Lyon hier.`, select it, click the Correctly icon | "Checking…", then Original/Corrected; text box unchanged      |
| 2   | Click **Apply**                                                        | `Je suis allé à Lyon hier.`, nothing else changed             |
| 3   | Click **Undo correction**                                              | original text restored                                        |
| 4   | Select `Hello, how are you?` → icon                                    | "No corrections needed."                                      |
| 5   | Select `Salut, t'es dispo demain ?` → icon                             | no change or only objective fixes; not formalized             |
| 6   | Select `cbj` → icon                                                    | unchanged                                                     |
| 7   | Select a sentence, click the icon, type in the box before the answer   | Apply disabled, Copy available                                |
| 8   | Same sentence twice; select the second → Apply                         | only the second one changes                                   |
| 9   | Password field → select → icon                                         | "never reads password…" notice; no request in the Network tab |
| 10  | Rich editor (e.g. a contenteditable) → icon                            | suggestion with Copy only                                     |
| 11  | Click **Copy**                                                         | suggestion in the clipboard                                   |
| 12  | Settings → requests today                                              | +1 per correction                                             |

In the service worker console (`chrome://extensions` → _service worker_):
only `generativelanguage.googleapis.com` requests, and no console output.

## 3. Other browser

Repeat steps 1–4 in the other browser. Keys and consent are per profile.

Report any step that fails, with its number and the message shown.
