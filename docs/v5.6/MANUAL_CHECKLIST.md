# V5.6 manual checklist (owner)

Before you start:

1. Run `npm run build`.
2. Click **Reload** in `chrome://extensions`.

## 1. Turn on and create

1. In the settings, open **Text shortcuts** and tick **Expand my shortcuts
   while I type**. Accept Chrome's request for access to all sites.
2. Add the shortcut `bjr` → `Bonjour`. Expected: it appears in the list and
   the counter shows **1 / 500**.
3. Reload any web page with a text box.

## 2. Typing

| #   | Type                            | Expected          |
| --- | ------------------------------- | ----------------- |
| 1   | `bjr` then a space              | `Bonjour `        |
| 2   | `bjr,`                          | `Bonjour,`        |
| 3   | `BJR `                          | `Bonjour `        |
| 4   | `abjr `                         | unchanged         |
| 5   | paste `bjr `                    | unchanged         |
| 6   | `bjr` then Enter                | unchanged         |
| 7   | Ctrl+Z right after an expansion | `bjr ` comes back |
| 8   | in a password field             | never changes     |

The Gemini request counter in the settings must not move.

## 3. Manage

- **Disable** `bjr`: typing it no longer expands. **Enable** it: it expands
  again (come back to the tab first).
- **Edit** the replacement to `Bonjour à tous`. Expected: the new text
  expands.
- **Delete**: Cancel keeps the shortcut; OK removes it.

## 4. Backup

1. Click **Export JSON**. Open the file: your shortcuts are there, and your
   API key is not.
2. Delete a shortcut, then click **Import JSON** and choose the file. The
   preview shows "1 new"; click Import. The shortcut is back.
3. Import the same file again. Expected: "0 new".

## 5. AI protection

1. Add the shortcut `cbj` → `My custom phrase`.
2. Select `Plese keep cbj unchanged.` and run **Correct**. Expected: `cbj`
   stays exactly as it is in the suggestion.
3. Try the same with Rewrite and Translate.

## 6. Turning off

Untick **Expand my shortcuts**. If the smart button is also off, site access
is removed (check the extension card in `chrome://extensions`).

Report any failed step with its number.
