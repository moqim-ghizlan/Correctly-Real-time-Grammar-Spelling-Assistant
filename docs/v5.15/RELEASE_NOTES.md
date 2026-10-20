# Correctly 5.15.0 — Release notes

## New: translate button on selected text (optional)

- Turn it on in **Settings → Getting started → Opening Correctly**:
  "Translate button on selected text". Off by default; like the handle, it
  asks Chrome for access to all sites, and that access is released when
  nothing needs it any more.
- Select text on any page (or in an ordinary text box): a small round
  button with a translation icon appears just below the end of the
  selection. **Showing it sends nothing.** It disappears when you click
  elsewhere, scroll, type or press Escape, and never appears in password or
  other sensitive fields, nor in Correctly's own window.
- **Up to 5 words:** a click opens a small bubble and translates the
  selection into your default language (one request). In the bubble you can
  choose another language (and Arabic variant) for this bubble only, then
  **Translate** again (one more request), **Copy** the result, or **Open in
  Correctly** (the window on Translation with the same text, no new
  request). The bubble is copy-only: the page is never changed.
- **More than 5 words:** a click opens the Correctly window directly on
  **Translation** with the selection and translates it at once (one
  request).
- Each translation counts as one request in your usage limits and
  statistics. Consent, key, route and limits work exactly as for the other
  actions. The setting is not synced: it needs site access on each computer.
- English and French interface.

## Test status

See [TEST_REPORT.md](TEST_REPORT.md): automated tests, lint, format, build,
audit and the real-browser smoke test (Brave, including the new step Y02)
pass. The owner's manual checklist
([MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)) is not done yet.
