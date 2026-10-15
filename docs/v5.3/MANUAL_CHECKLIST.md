# V5.3 manual checklist (owner)

Prerequisites: run `npm run build`, then click **Reload** in
`chrome://extensions`. Your key must be saved and **Correction** ticked in
the settings. Use test sentences only.

## 1. Shortcut

1. In the settings, look at **Entry points**: the line shows the assigned
   shortcut. If it says "not set", click **Change shortcut** and choose one,
   for example Alt+Shift+C.
2. In a textarea, type `Je suis aller a Lyon hier.`, select it, then press the
   shortcut. Expected: the panel appears, then the suggestion; **Apply**
   corrects only that text.
3. Turn the shortcut off in the settings and press it again. Expected:
   nothing happens.

## 2. Right-click menu

1. Select a sentence with errors in a textarea, right-click, then choose
   **Correctly → Correct selected text**. Expected: the same panel.
2. Select plain text in an article (not in a text box), then use the menu if
   it appears. Expected: no menu, or "Select text inside a text box…" with
   nothing sent.
3. Turn the menu off in the settings and right-click. Expected: the Correctly
   entry is gone.
4. Close and reopen the browser. Expected: a single Correctly entry, which
   still works.

## 3. Smart button

1. Settings → tick **Smart button**. Chrome asks for access to all sites:
   accept. Then reload the open page.
2. Click into a textarea. Expected: a small ✓ in the bottom-right corner of
   the field. Typing must not trigger anything (check the counter in the
   settings).
3. Select a sentence, then click the ✓. Expected: the selection is kept and
   the correction panel opens.
4. Click outside the field. Expected: the ✓ disappears.
5. A password field must never show the ✓.
6. Untick **Smart button**. Expected: the ✓ disappears from open tabs, and
   site access is removed (the extension card in `chrome://extensions` no
   longer shows site access).

## 4. Brave

Repeat 1.2, 2.1 and 3.2–3.3 in Brave.

Report any step that fails, with its number.
