# Correctly V5.11 — Baseline (WP0)

Audit of the checked-out repository before any V5.11 change.

## Environment

- Branch `dev`, HEAD `a226310` (V5.10), clean worktree.
- Windows 10 Home 10.0.19045, Node 24.21.0.
- Chrome 155.0.8059.40, Brave (Chromium 155).

## Baseline results (before changes)

| Check          | Result                                          |
| -------------- | ----------------------------------------------- |
| `npm test`     | PASS — 29 files, 533 tests                      |
| Lint / build   | not re-run before changes (V5.10 report: green) |
| Known failures | none                                            |

## What existed (V5.10)

| Area                     | Real code                                                                                                                                                                                        |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Toolbar icon             | `chrome.action.onClicked` → `correctInTab(tab, 'toolbar')` → inject `content.js`, run **correction directly**. No `default_popup`.                                                               |
| Shortcuts                | `correct-selection` (Alt+Shift+C), `rewrite-selection`, `translate-selection` (no key). No Ctrl+M.                                                                                               |
| Context menu             | Correct / Rewrite… / Translate… / Translate & rewrite…                                                                                                                                           |
| Smart button (V5.3)      | `content/smart-button.ts`: **three round buttons (✓ ✎ ⇄) inside the focused field** — the "contextual three-button" concept the spec replaces. Loaded by `smart.js` when `triggers.smartButton`. |
| Selection / Apply / Undo | `content/correction.ts`: `capture()` snapshot (field, start, end, value), `applyBlocker()`, `replaceRange()`, guarded Undo. Plain text boxes only; contenteditable and rich editors copy-only.   |
| Preview                  | `CorrectionPanel` (closed shadow root, bottom-right), one panel per action.                                                                                                                      |
| AI dispatch              | Content script sends `CORRECT_TEXT` / `REWRITE_TEXT` / `TRANSLATE_TEXT`; worker checks sender + exact shape, consent, route, quota `admit`/`dispatch`, then one `fetch`.                         |
| Storage                  | `chrome.storage.local` restricted to trusted contexts: content scripts cannot read it; they ask the worker (`PAGE_CONFIG`).                                                                      |
| Options page             | `chrome.runtime.openOptionsPage()` (content scripts cannot call it).                                                                                                                             |

## Gaps against the V5.11 spec

- No in-page modal, no tabs, no shared input, no per-tab cache.
- No right-edge handle, no position persistence.
- The toolbar icon corrected directly; there was no Ctrl+M.

No prerequisite was missing: selection capture, guarded Apply/Undo,
providers, quotas and statistics were reusable as they are.
