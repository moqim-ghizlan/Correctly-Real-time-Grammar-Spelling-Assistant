# Correctly V5.6

Personal Chrome/Brave extension (Manifest V3, TypeScript): an on-demand AI
writing assistant using your own Gemini API key.

- **Correction on request.** Select text in a text box or editor, then use
  any entry point: the toolbar button, the **Alt+Shift+C** shortcut, the
  right-click menu **Correctly → Correct selected text**, or the optional smart
  button next to the text box. **One** Gemini request checks and corrects it.
  Nothing changes until you click **Apply** (plain text boxes); elsewhere you
  copy the suggestion. Undo is available while the text is unchanged.
- **Frontend only.** No Java, Python, LanguageTool, local server or Windows
  installer. Node.js is only needed to build and test.
- **Nothing is read or sent without an explicit action.** The content script
  is injected only into the tab (and frame) where you act (`activeTab`), and
  only after you allowed sending selected text in the settings. Plain page
  text, password, email, phone, URL, number and search fields are never sent.
  The smart button is off by default; turning it on asks Chrome for access to
  all sites, and turning it off removes that access.
- **Rewrite (V5.4).** Right-click **Correctly → Rewrite selected text…**, the
  smart button's ✎, or an optional shortcut (set it in
  `chrome://extensions/shortcuts`). Pick one or more styles (Professional,
  Formal, Friendly, Casual, Polite, Concise, Funny), click **Generate
  rewrites**: **one** Gemini request returns one labeled version per style, in
  the same language. Choose one, then Apply, Copy or Cancel.
- **Translate (V5.5).** Right-click **Correctly → Translate selected text…**
  or **Translate & rewrite…**, the smart button's ⇄, or an optional
  shortcut. Choose From (Auto-detect or a language), To (French, English,
  Arabic, Turkish, German, Spanish) and, for Arabic, **Modern Standard** or
  **Syrian colloquial**; optionally tick styles. **One** Gemini request
  detects, translates and styles; then Apply, Copy or Cancel.
- **Text shortcuts (V5.6).** In the settings, turn on **Text shortcuts**
  (asks for site access), add e.g. `bjr` → `Bonjour`; typing `bjr` then a
  space or `, ; : . ! ?` expands it locally — no internet, no AI, no quota.
  Up to 500 entries, JSON export/import with preview. Shortcuts found in text
  you correct, rewrite or translate are kept unchanged by default.
- More providers, usage limits and statistics arrive in later V5 releases
  (plans in [`v5/`](v5/)).

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
npm run package        # release/Correctly-V5.6-Extension.zip (+ .sha256)
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
4. Under **Correction**, tick _Send the text I select to Google Gemini…_.
5. On any page, select up to 2,000 characters in a text box and use any entry
   point (toolbar, Alt+Shift+C, right-click menu, smart button). Change the
   shortcut in `chrome://extensions/shortcuts`. Review the suggestion, then
   **Apply**, **Copy** or **Cancel**.
   Without a key or consent (or on `chrome://` pages) the button opens the
   settings instead.
6. **Local safety limit**: at most 20 Gemini requests (tests and corrections)
   per day by default (1–100). The
   counter resets at local midnight. It is a safety brake, **not** a billing
   limit — set a spend cap in your Google billing settings.

The key is stored in `chrome.storage.local` of this browser profile only (not
synced, not encrypted). Use it only on your own computer and profile.

## Repository layout

| Path                        | Content                                                   |
| --------------------------- | --------------------------------------------------------- |
| `frontend/src/`             | source (`background/`, `content/`, `options/`, `shared/`) |
| `frontend/tests/`           | unit and integration tests                                |
| `frontend/manifest.json`    | the only manifest (copied to `dist/` by Vite)             |
| `scripts/`                  | dist audit, packaging, dev watch, browser smoke test      |
| `docs/v5.1/` … `docs/v5.6/` | architecture, security, test reports, checklists          |
| `v5/`                       | V5.1–V5.x specifications                                  |
| `plans/`                    | V1–V4 plans (history)                                     |

See [docs/v5.6/V5.6_REPORT.md](docs/v5.6/V5.6_REPORT.md),
[docs/v5.5/V5.5_REPORT.md](docs/v5.5/V5.5_REPORT.md),
[docs/v5.4/V5.4_REPORT.md](docs/v5.4/V5.4_REPORT.md),
[docs/v5.3/V5.3_REPORT.md](docs/v5.3/V5.3_REPORT.md),
[docs/v5.2/V5.2_REPORT.md](docs/v5.2/V5.2_REPORT.md),
[docs/v5.1/ARCHITECTURE.md](docs/v5.1/ARCHITECTURE.md),
[SECURITY.md](docs/v5.1/SECURITY.md),
[TEST_REPORT.md](docs/v5.1/TEST_REPORT.md) and
[MANUAL_CHECKLIST.md](docs/v5.1/MANUAL_CHECKLIST.md).
