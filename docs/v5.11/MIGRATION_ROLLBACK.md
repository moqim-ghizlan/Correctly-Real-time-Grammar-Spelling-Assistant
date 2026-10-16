# Correctly V5.11 — Migration, rollback and troubleshooting

## Migration

None needed. V5.11 adds one key and changes no existing format:

| Key                                                  | Change                                                         |
| ---------------------------------------------------- | -------------------------------------------------------------- |
| `correctly.v5.settings`                              | unchanged; `triggers.smartButton` now means "show the handle"  |
| `correctly.v5.handle`                                | **new**, `{ schemaVersion: 1, yRatio }`; absent = 0.5 (centre) |
| providers, secrets, shortcuts, quota/stats IndexedDB | untouched                                                      |

V4 keys are not read or written.

## Rollback to 5.10.0

1. Build commit `a226310` (V5.10) in a separate worktree
   (`git worktree add ../correctly-5.10 a226310`, then `npm ci` and
   `npm run build` there), or use the 5.10.0 ZIP.
2. Copy that build's `dist/` contents **into the folder already loaded**
   (keep the same path: an unpacked extension loaded from another folder
   gets another ID and does not see the stored keys and data), then click
   **Reload**. Do **not** remove the extension (removal deletes keys,
   limits and statistics).
3. 5.10.0 ignores `correctly.v5.handle` (unknown key). Keys, routes, quotas,
   statistics and shortcuts are kept. With the setting on, the three smart
   buttons come back.

Nothing to clean up; no destructive step. V5.11 is tagged `v5.11.0`; the
V5.10 commit is `a226310`.

## Troubleshooting

| Symptom                                 | Check                                                                                                             |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| No handle                               | Settings → "Correctly handle on the right edge" on, site access granted; reload open pages. Top frame only.       |
| Ctrl+M does nothing                     | `chrome://extensions/shortcuts` (or `brave://…`): assign "Open Correctly"; "Keyboard shortcuts" setting on.       |
| The settings open instead of the window | Consent not given, no usable route, or a browser page (`chrome://`, Web Store, PDF).                              |
| Input empty although text selected      | Selection outside a text box (plain page text is not taken), in a sensitive field, or in an embedded frame.       |
| Apply disabled                          | The note explains: no text box selection, text/selection changed, IME active, or a number/link differs. Use Copy. |
| Undo refused                            | Something was typed after Apply, so a safe restore is impossible; fix the text by hand.                           |
