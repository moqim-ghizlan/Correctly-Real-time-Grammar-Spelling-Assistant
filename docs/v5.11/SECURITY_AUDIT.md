# Correctly V5.11 — Security and privacy audit

## Permissions and manifest

- **No new permission, host or optional host.** `activeTab`, `contextMenus`,
  `scripting`, `storage`; hosts: Gemini and OpenAI only; optional
  `<all_urls>` unchanged (requested only when the handle or text shortcuts
  are turned on). No `default_popup`, no `content_scripts`, no
  `web_accessible_resources` (the logo is inline SVG). Enforced by
  `scripts/audit-dist.mjs` (now expects 5.11.0 and the `open-correctly`
  command).
- New command `open-correctly` (Ctrl+M) is handled by the browser; no page
  key listener and no `preventDefault()` on page events.

## Messages (content script → worker)

| Message           | Shape check                                 | Effect                                               |
| ----------------- | ------------------------------------------- | ---------------------------------------------------- |
| `OPEN_MODAL`      | exactly `{ type }`, our content script only | same gate as the toolbar (setting, consent, route)   |
| `OPEN_SETTINGS`   | exactly `{ type }`, our content script only | `chrome.runtime.openOptionsPage()` — no URL accepted |
| `HANDLE_POSITION` | exactly `{ type, yRatio }`, finite 0–1      | stores one number in `correctly.v5.handle`           |

Tests: forged sender IDs, the options page as sender, extra fields, out of
range / NaN / string values are all ignored (`service-worker.test.ts`,
"V5.11 unified modal entry points"). The removed `openRewrite` /
`openTranslate` messages are ignored.

## No unintended AI request

Only a **Generate** click sends `CORRECT_TEXT` / `REWRITE_TEXT` /
`TRANSLATE_TEXT`, through the unchanged worker path (trusted sender, exact
shape, consent, frozen route, quota `admit` + `dispatch` before `fetch`).
Opening (any entry point), hover, drag, typing, tab switch, option change,
Settings, Hide, resize: zero AI messages (tests T04, G01, G03, G05, H03,
browser C02). One request per click; a second click while waiting is
ignored (G09). A late reply after Hide, an edit or Cancel is dropped
(S08, S09) — and Cancel says the sent request may still count.

## Page safety

- Closed shadow roots for the modal, the handle and the Undo offer.
- All page and model text rendered with `textContent` (R02); no `innerHTML`.
- Apply uses the V5.2 guard on the **original** selection only (same field,
  value, range; no IME; not suspicious). Never the focused field, never a
  text search (A02, A10).
- Undo only while the field is unchanged since Apply; expiry never edits
  (A08, A09).
- Sensitive fields (password, OTP, card, secret-labelled, code/rich
  editors) are never read: the modal opens empty with the notice.
- Plain page text outside editors is not prefilled (DECISIONS D9).
- Key events typed in the modal do not reach page handlers.
- Only trusted pointer/keyboard events act on the handle.

## Storage and privacy

- New key `correctly.v5.handle` = `{ schemaVersion: 1, yRatio }`: no text,
  no URL, no site. Single writer: the worker. Normalized on every read.
- Text, results and tab choices live only in the modal instance and are
  dropped on Hide. Nothing is logged (no `console` calls added).
- Keys never reach the page: `PAGE_CONFIG` carries `smartButton`, `handleY`
  and shortcut pairs only (KEY-21).

## Residual risks

- R-11-1: a page can visually cover the handle or the modal with its own
  overlay (no security impact; the closed root cannot be read or clicked
  by page scripts).
- R-11-2: Ctrl+M may be taken by another extension or OS tool; Chrome then
  leaves the command unassigned (documented, Troubleshooting).
- R-11-3: page capture-phase key listeners on `window` still see keys typed
  in the modal before the shadow root stops them (bubbling listeners do
  not). Text is never exposed: events are retargeted to the host element.
