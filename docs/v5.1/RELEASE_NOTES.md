# Correctly V5.1 — release notes

**Version:** 5.1.0 · **Date:** 2026-10-15 · **Status:** foundation; live
Gemini success pending the owner's own key test.

## New

- Frontend-only Manifest V3 extension: settings page + service worker.
- Gemini API key: save, replace (with confirmation), remove, show/hide;
  stored in `chrome.storage.local` of the profile.
- Model choice: `gemini-3.1-flash-lite` (default) or `gemini-3.5-flash-lite`.
- **Test connection**: one fixed `Reply with OK only.` request from the
  service worker; clear status (Not configured / Configured / Checking... /
  Connected / Connection failed) and actionable error messages.
- Local safety limit: 20 tests/day by default (1–100), counted before each
  request, reset at local midnight.
- Toolbar button opens the settings.
- `npm run package` → `release/Correctly-V5.1-Extension.zip`.

## Removed (available in Git tag `v4.0.0`)

- LanguageTool engine, local server on `127.0.0.1:8081`, Python Windows
  server/tray, bundled Java runtime, Windows installer and `createSetup.cmd`.
- V4 content scripts (underlines, popups, sentence correction), popup,
  context menu, text-expansion shortcuts (planned again for V5.6).
- Permissions `contextMenus`, `activeTab`, localhost hosts, content scripts
  on all sites.

V4 data stored in the browser (settings, shortcuts) is left untouched.

## Known limitations

- No correction yet (V5.2), no in-page UI (V5.3).
- The key is not encrypted; the local limit is not a billing limit.
- Counters are per browser profile.
