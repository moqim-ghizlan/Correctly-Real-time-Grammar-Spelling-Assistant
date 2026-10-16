# Correctly V5.11 — Architecture

## Entry points → one modal

```text
Toolbar icon ── chrome.action.onClicked ─────────┐
Ctrl+M ──────── chrome.commands 'open-correctly' ─┤
Right-edge handle (smart.js, top frame)           │
   click → { type: OPEN_MODAL } ──────────────────┤
                                                  ▼
        worker correctInTab(tab, trigger, frameId, 'open')
          · trigger enabled? (keyboard / smartButton)
          · consent + at least one usable route, else options page
          · inject content.js → correctlyRun('open', styles, translation, rewriteEnabled)
                                                  ▼
        content.js openModal(document, options)
          · already visible → focus it (no reset, no second root)
          · else capture() the verified selection, new CorrectlyModal
          · tell the handle to hide (globalThis.correctlyHandle)
```

Shared state between the two classic bundles of the isolated world
(`content.js`, `smart.js`) goes through `globalThis`:
`correctlyModal`, `correctlyHandle`, `correctlyUndo`, `correctlyPanel`.

## Files

| File                                            | Role                                                                                                                                     |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/content/modal.ts`                 | `CorrectlyModal` (session, shared text, revision, per-tab results, Generate, Apply/Copy/Cancel, Hide), `UndoToast` (5 s), `openModal()`. |
| `frontend/src/content/handle.ts`                | `RightEdgeHandle` (semicircle, pointer drag, keyboard), `installHandle()`.                                                               |
| `frontend/src/content/icons.ts`                 | Inline SVG: logo, gear, hide chevron (no URL loads).                                                                                     |
| `frontend/src/content/index.ts`                 | `correctlyRun(intent…)`: `'open'` → modal; other intents → V5.2–V5.5 panel (context menu, per-action shortcuts).                         |
| `frontend/src/content/smart.ts`                 | Opt-in page script: text shortcuts + handle (was the three-button smart button).                                                         |
| `frontend/src/content/correction.ts`            | Unchanged logic, reused: `capture`, `applyBlocker`, `replaceRange` (now exported), `NOTICES.noTarget` added.                             |
| `frontend/src/background/index.ts`              | `'open'` request, `OPEN_MODAL`, `OPEN_SETTINGS`, `HANDLE_POSITION`, Ctrl+M command, `handleY` in `PAGE_CONFIG`.                          |
| `frontend/src/shared/contracts.ts`              | New message types and `isHandlePositionRequest` (exact shape, finite 0–1).                                                               |
| `frontend/src/shared/settings.ts`, `storage.ts` | `HandlePosition`, `normalizeHandle`, `loadHandle`/`saveHandle`, key `correctly.v5.handle`.                                               |

## Modal session

- **Fresh opening** (hidden → open): new `CorrectlyModal` instance = new
  session. Tab `correction`, text = verified selection or `''`, options =
  saved defaults, no results.
- `sharedText` is the single source; one `<textarea>` above the tab panels.
- `revision` is bumped by every real change of the text; all three tabs are
  reset at once.
- Each tab keeps `{ choices, chosen, operationId, status, quota, pending }`.
  `pending` is a request token. A reply is shown only if
  `visible && revision unchanged && tab still waits for that token`.
- Option changes clear only that tab's result.
- Generate sends the existing `CORRECT_TEXT` / `REWRITE_TEXT` /
  `TRANSLATE_TEXT` messages; replies go through the existing
  `toCorrectionResult` / `toRewriteResult` validators.
- **Apply**: `applyBlocker(target)` (same field, value, range, no IME) and
  not suspicious → `replaceRange` on the original range → `AI_EDIT applied`
  (only if the field holds the text) → `hide()` → `UndoToast`.
- **Undo** (5 s): only while `field.value` equals the value right after
  Apply and the field is editable; then `AI_EDIT undone`. Expiry removes the
  offer only.
- **Hide**: session over, listeners removed, focus back to the original
  field, handle visible again.

## Layout

Fixed outer box (flex column): header (logo, title, gear, hide) · tablist ·
**scrolling body** (text, active tab panel) · footer (note, Apply, Copy,
Cancel). Only the body scrolls, so the outer size never depends on the tab
or the result length. Dark glass by default, light under
`prefers-color-scheme: light`, solid fallback without `backdrop-filter`,
`prefers-reduced-motion` and `forced-colors` handled.

## Handle

`position: fixed; right: 0`, 48×25 px half-disk (`border-radius` on the left
side only). Y = `yRatio × viewport height`, clamped to 16 px margins on every
resize. `pointerdown` starts a gesture; ≥ 6 px vertical movement makes it a
drag (X ignored); `pointerup` saves after a drag, opens after a plain press.
`pointercancel`, lost capture and window blur end the gesture without opening.
`mousedown` is prevented so the page field keeps focus and selection.
Only trusted events count. Enter/Space open; ↑/↓ move by 5 %.
