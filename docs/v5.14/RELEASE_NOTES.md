# Correctly 5.14.0 — Release notes

## Before you update: the extension ID changes once

5.14 gives Correctly a **fixed extension ID**
(`annnnjfiddfooccihpgebjnipppaejpo`), the same on every computer and
browser, so it can use the browser's synced storage. Because the ID
changes, **5.14 starts empty** the first time. Once per computer, before
installing 5.14:

1. Settings → **Text shortcuts → Export** (JSON). Import it in 5.14.
2. Note your API key names, routes and usage limits; enter them again in
   5.14 (keys are never exported, on purpose).
3. Optional: Statistics → export CSV/JSON as an archive. Statistics cannot
   be imported back: the history starts again at zero.

Remove the old version, then load 5.14. Later updates keep the same ID.

## New: optional sync between your computers

- New settings page **Sync**. **Off by default**; turn it on on each
  computer and choose what follows you: **Text shortcuts** (the list),
  **Settings** (interface language, rewrite styles and formality,
  translation preferences, keyboard and right-click triggers),
  **Correctly keyboard shortcuts** (the combinations), and **API keys and
  routes**.
- Through the browser's own sync (`chrome.storage.sync`, your Google
  account). **Correctly has no server** and sends nothing more itself.
- **API keys are encrypted on your computer** with a passphrase you choose
  (PBKDF2-SHA-256, 600,000 iterations → AES-GCM) before they leave it. On
  another computer, enter the same passphrase once to **unlock** them. A
  forgotten passphrase cannot be recovered: enter the keys again and choose
  a new one.
- **Text shortcuts are merged one by one**: shortcuts added on two
  computers are both kept, an edit or deletion on one reaches the other.
  When the same shortcut was changed on both, one version wins and the
  other computer offers **Restore**.
- First activation with two different sets of settings: you choose
  **Keep this computer's version** or **Use the synced version** (the other
  one is kept, restorable).
- **Never synced:** usage limits (each computer applies its own),
  statistics, permission to send text, the handle and access to all sites,
  "expansion on" and "Correctly shortcuts on" (they need site access on each
  computer).
- About **100 KB** in all (browser limit): a few hundred short shortcuts.
  Above that nothing is sent, nothing is cut, and the page says so. The page
  shows the space used, the status of each item, **Sync now** and **Delete
  synced data**.
- **Chrome:** supported. **Brave:** not guaranteed (Brave Sync works
  differently); not tested yet.

## Other changes

- The API key warning (AI providers) now says keys sync only if you turn it
  on, encrypted.
- `scripts/audit-dist.mjs` requires the fixed public key and refuses any
  private key in the package. The browser smoke test writes its evidence to
  `docs/v5.14/evidence/` and checks the Sync page (step Y01).
- Fixed an ESLint error in `scripts/i18n-options.mjs` (`console` global),
  present since 5.13.

## Test status

See [TEST_REPORT.md](TEST_REPORT.md): automated tests, lint, format, build
and the real-browser smoke test (Brave) pass. The two-computer manual
checklist ([MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)) is **not
done yet**, including Brave sync and a live key on a second computer.
