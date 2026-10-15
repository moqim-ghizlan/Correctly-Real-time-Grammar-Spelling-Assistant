# Correctly V5.1

Personal Chrome/Brave extension (Manifest V3, TypeScript) that will become an
on-demand AI writing assistant. **V5.1 is the foundation only**: it lets you
save a personal Gemini API key, choose a model, and run an explicit
**Test connection**, guarded by a local daily limit.

- **Frontend only.** No Java, Python, LanguageTool, local server or Windows
  installer. Node.js is only needed to build and test.
- **No text from websites is read or sent.** V5.1 has no content script and
  only sends the fixed prompt `Reply with OK only.` when you click
  _Test connection_.
- Correction, rewriting, translation, shortcuts, more providers and statistics
  arrive in later V5 releases (plans in [`v5/`](v5/)).

V1–V4 (LanguageTool engine, Windows server and installer) are archived in Git:
tag `v4.0.0` contains the last V4 sources.

## Build

Requirements: Node.js 22.13+ or 24+, npm.

```powershell
npm ci
npm run build     # typecheck + bundle into dist/ + static audit of dist/
npm test          # unit + integration tests (Vitest, jsdom)
npm run lint
```

Optional:

```powershell
npm run package        # release/Correctly-V5.1-Extension.zip (+ .sha256)
npm run test:browser   # real-browser smoke test (Brave by default)
node scripts/verify-browser.mjs --browser=chrome
```

`test:browser` sends **one** request to Google with a dummy key (expected
answer: invalid key, no cost). Add `--offline` to skip it.

## Install in Chrome or Brave

1. `npm run build`
2. Open `chrome://extensions` (or `brave://extensions`), enable **Developer
   mode**, click **Load unpacked** and select the **`dist`** folder.
3. Click the Correctly toolbar button (or _Extension options_) to open the
   settings.
4. After rebuilding, click **Reload** on the extension card.

Chrome and Brave profiles are separate: each keeps its own key, model, limit
and counter.

## Use

1. Create a key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Paste it in **Gemini API key** and click **Save key**. The status becomes
   _Configured_ (saved, not yet verified).
3. Click **Test connection**. _Connected_ appears only after Gemini actually
   answered with text.
4. **Local safety limit**: at most 20 tests per day by default (1–100). The
   counter resets at local midnight. It is a safety brake, **not** a billing
   limit — set a spend cap in your Google billing settings.

The key is stored in `chrome.storage.local` of this browser profile only (not
synced, not encrypted). Use it only on your own computer and profile.

## Repository layout

| Path                     | Content                                                 |
| ------------------------ | ------------------------------------------------------- |
| `frontend/src/`          | extension source (`background/`, `options/`, `shared/`) |
| `frontend/tests/`        | unit and integration tests                              |
| `frontend/manifest.json` | the only manifest (copied to `dist/` by Vite)           |
| `scripts/`               | dist audit, packaging, dev watch, browser smoke test    |
| `docs/v5.1/`             | architecture, security, test report, manual checklist   |
| `v5/`                    | V5.1–V5.x specifications                                |
| `plans/`                 | V1–V4 plans (history)                                   |

See [docs/v5.1/ARCHITECTURE.md](docs/v5.1/ARCHITECTURE.md),
[SECURITY.md](docs/v5.1/SECURITY.md),
[TEST_REPORT.md](docs/v5.1/TEST_REPORT.md) and
[MANUAL_CHECKLIST.md](docs/v5.1/MANUAL_CHECKLIST.md).
