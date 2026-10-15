# Correctly V5.10 — Owner guide (install, keys, privacy, limits, recovery)

This guide covers the whole extension. The detailed guides are still valid:
[usage limits](../v5.8/USER_GUIDE.md) and [statistics](../v5.9/USER_GUIDE.md).

## 1. Install in Chrome or Brave

Nothing else runs on your computer: no Java, Python, LanguageTool, local
server or Windows installer.

1. Get the extension, either way:
   - unzip `release/Correctly-V5.10-Extension.zip` into a folder you keep, or
   - build it: `npm ci` then `npm run build`, which gives the `dist` folder.
2. Check the ZIP before unzipping it (PowerShell):
   `Get-FileHash release\Correctly-V5.10-Extension.zip -Algorithm SHA256`.
   It must match the `.sha256` file next to it.
3. Open `chrome://extensions` (or `brave://extensions`) and turn on
   **Developer mode**.
4. Click **Load unpacked** and select the folder that contains
   `manifest.json`.
5. Click the Correctly toolbar button to open the settings.

**Upgrading from V5.9.** Replace the folder's contents (same folder), then
click **Reload** on the extension card. Keep the same folder: Chrome derives
the extension's identity from it. Your keys, routes, limits, statistics and
shortcuts stay in the browser profile. V5.10 changes no stored format.

### Permissions and why

| Permission                                            | Used for                                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------------------------- |
| `activeTab`, `scripting`                              | Read the selected text in the tab where **you** act (toolbar, shortcut, menu) |
| `contextMenus`                                        | The right-click menu **Correctly**                                            |
| `storage`                                             | Settings, keys, shortcuts (this browser profile only)                         |
| `generativelanguage.googleapis.com`, `api.openai.com` | The only servers ever contacted, and only on your action                      |
| All sites (optional, asked when you turn it on)       | Smart button and text shortcuts. Turning both off gives the access back       |

## 2. Add your API keys

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey)
   and/or the [OpenAI dashboard](https://platform.openai.com/api-keys). API
   keys are billed per use: a ChatGPT or Gemini subscription does not pay
   for them.
2. In **AI providers**, choose the provider, name the key, paste it and click
   **Save key**. Nothing is sent.
3. **Check key** is free: it lists the models the key can use. It is never
   counted.
4. In **Which key and model each action uses**, choose a key and model for
   **Default**, and optionally per action. **Test** sends one tiny prompt: it
   may be billed and it counts in your limits.
5. Under **Correction**, allow sending the text you select.

If a key is missing, disabled, deleted or refused, the action stops with a
message. Correctly never switches to another key, model or provider, and
never retries by itself.

### Where your keys are, honestly

- They are stored **unencrypted** in this browser profile
  (`chrome.storage.local`). Only the extension's own pages and worker can
  read them; web pages and the extension's page scripts cannot.
- They are not synced, not exported and not in any backup file.
- Malware, another malicious extension or anyone using your computer
  account could still read them. Use Correctly only on your own computer.
- Set spend limits and alerts in your Google and OpenAI billing dashboards.

## 3. What is sent, and when

- Only after **your** action: toolbar button, keyboard shortcut, right-click
  menu, smart button, or **Generate**/**Translate** in a picker.
- Only the text you selected (at most 2,000 characters), with fixed
  instructions. Never the page, the address, other fields or your shortcut
  list. Protected shortcut words are replaced by markers before sending.
- Never from password, email, phone, URL, number or search fields, payment
  or one-time-code fields, or secret-labelled editors.
- Typing, opening the settings or Statistics, text shortcuts and key checks
  send no AI request.
- What Google or OpenAI keep depends on their API terms. OpenAI requests use
  `store: false`.

## 4. Usage limits (counts, not money)

- Default: 20 AI requests per day in total. Add weekly and monthly limits,
  per action, per provider or per key, in **Usage limits**.
- One action is one request, whatever the number of styles.
- Warnings at 80 % and 95 %. At 100 % the request is refused **before**
  anything is sent, and the message names the limit and its reset time.
- **Pause all AI requests** stops every AI request; text shortcuts still
  work.
- A request whose answer was lost (timeout, or the connection dropped after
  sending) stays counted: the provider may have received it and billed it.
  The message says so. Retry only if you accept another request.
- The limits count requests made from this browser profile. They do not see
  other browsers or apps using the same key, and they are not a spending
  cap.

## 5. Statistics and estimated cost

- **Requests used** = requests sent or possibly sent. **Successful AI
  results** ≠ **AI edits applied** (only what you applied).
- Tokens are those the provider reported. Missing counts are shown as
  unknown, never 0.
- Cost is an **estimate in USD** from reported tokens and dated prices. It is
  **Partial** or **Unavailable** when tokens or a price are missing, and
  `$0.00` only when nothing was sent. It is not your invoice.
- Exports (CSV/JSON) never contain your text, keys or page addresses.
- **Delete statistics history** never frees a limit.

## 6. Text shortcuts and backup

- Turn on **Text shortcuts** (asks for site access), add e.g. `bjr` →
  `Bonjour`. Typing `bjr` then a space or `, ; : . ! ?` expands it on your
  computer: no internet, no AI, no limit used.
- Not in password, payment, code editors, email fields, or while an input
  method (IME) is composing. Pasting a trigger does not expand it.
- **Export** saves a dated JSON file with your shortcuts only (no key, no
  settings). **Import** shows a preview first; an invalid file changes
  nothing.
- Keep an export before every upgrade.

## 7. Backup, rollback and data lifetime

| Data                   | Backup                         | Survives Reload/upgrade | Lost when                                         |
| ---------------------- | ------------------------------ | ----------------------- | ------------------------------------------------- |
| Shortcuts              | Export JSON                    | Yes                     | Uninstall, clearing browser data, another profile |
| API keys               | None (re-enter them)           | Yes                     | Same                                              |
| Routes, settings       | None                           | Yes                     | Same                                              |
| Limits, usage, history | Statistics export (aggregates) | Yes                     | Same                                              |

**Rollback to V5.9.** V5.10 uses the same storage keys and the same IndexedDB
version (v2), so loading the V5.9 folder over it keeps your data. Do not go
back to **V5.8 or older**: they use IndexedDB v1, cannot open the v2
database and should refuse every AI request until V5.9+ is reinstalled (by code review, not tested; nothing is
deleted). V5.1–V5.7 do not know the V5.7 key profiles.

**Uninstalling** deletes everything the extension stored in that profile.
Loading the extension from another folder, profile or computer starts empty:
re-enter keys and import your shortcuts.

## 8. If something goes wrong

| Situation                         | Do this first                                                                                                               |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Unexpected provider spending      | **Pause all AI requests**; check the provider dashboard; revoke the key if in doubt                                         |
| You think a key leaked            | Revoke or rotate it in Google AI Studio / OpenAI dashboard, then paste the new key with **Edit** in **AI providers**        |
| Text changed unexpectedly         | Ctrl+Z in the field (or **Undo** in the Correctly panel while the text is unchanged); stop using Apply on that site         |
| "Cannot verify your usage limits" | Open **Usage limits** and click **Restore safe limits** if it is offered (your usage is kept); no request is sent meanwhile |
| Settings show "damaged"           | Do not clear browser data; export shortcuts if possible; keep the profile and report it                                     |

Disabling or removing the extension stops **new** requests at once. It
cannot cancel a request that was already sent.

## 9. Supported editors

| Editor                                                                     | What works                                                        |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Plain `textarea`, text `input`                                             | Preview, Apply on the exact selection, Undo while unchanged, Copy |
| `contenteditable` and rich editors (Gmail, ChatGPT, …)                     | Preview and **Copy** only; Apply is disabled on purpose           |
| Code editors (Monaco, CodeMirror, Ace), ProseMirror, Quill, Slate, Lexical | Copy only                                                         |
| Frames from another site                                                   | A notice; nothing is read                                         |
| `chrome://`, Web Store, PDF viewer                                         | The button opens the settings; nothing is read                    |

Apply is refused when the text, selection or field changed since the request
(the panel says so and offers Copy). Real sites (Gmail, ChatGPT, WhatsApp
Web, LinkedIn, Reddit) were **not** tested for V5.10.
