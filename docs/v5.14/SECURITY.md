# Correctly 5.14 — Security of sync

## What changes

Data can now leave this computer, **only if the user turns sync on**, and
only to the browser's own synced storage (the Google account of the browser
profile). Correctly adds no server, no host permission, no CSP source and no
network request: the browser does the transfer.

## Threats and answers

| Threat                                         | Answer                                                                                                                                                                                                                    |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google account taken over → API keys stolen    | Keys sync only if "API keys and routes" is ticked, and then only encrypted: PBKDF2-SHA-256 (600,000 iterations, random 16-byte salt) → AES-GCM-256, random 12-byte IV per push. Profile IDs and labels are encrypted too. |
| Weak passphrase                                | At least 8 characters; the page says it must differ from the Google password. A strong passphrase is still the user's job (documented).                                                                                   |
| Wrong passphrase / tampered ciphertext         | AES-GCM authentication fails → `badPassphrase` or `locked`; nothing is written.                                                                                                                                           |
| A web page or content script reads synced data | `chrome.storage.sync.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })` at worker start, like `storage.local`. Correctly's content scripts never read storage.                                                          |
| A page drives sync (clear, new passphrase…)    | Sync messages are accepted only from the extension's own pages (`isTrustedSender`) and only with exact shapes (`isSyncRequest`); a content-script sender is ignored (test `sync-worker.test.ts`).                         |
| Remote data crafted to break the extension     | Every received payload goes through the existing normalizers (`normalizeSettings`, `validateList`, `normalizeKeybindings`, providers parser). Invalid → `remoteDamaged`, nothing applied. Newer schema → refused.         |
| Enabling a sensitive feature from afar         | Never synced: consent to send text, the handle, all-sites access, "expansion on", "keyboard shortcuts on", usage limits.                                                                                                  |
| Silent data loss                               | Incomplete batches are not applied; a replaced version is backed up and restorable; over-quota writes nothing.                                                                                                            |
| Write loop exhausting Chrome's quota (120/min) | Writes only when content hashes differ from the agreed base; test "no loop" counts writes.                                                                                                                                |
| Private key in the package                     | `.pem` git-ignored; `audit-dist.mjs` refuses `.pem`/`.key` files and any `-----BEGIN … PRIVATE KEY-----` text in `dist/`.                                                                                                 |
| Logs                                           | None added (worker and pages).                                                                                                                                                                                            |

## Accepted risk

- The key derived from the passphrase is stored in `storage.local`
  (`correctly.v5.syncSecret`) so the worker can re-encrypt without asking
  again. That area already holds the API keys in clear, so this adds no new
  local exposure; anyone with access to the browser profile can read both.
- The passphrase travels once from the settings page to the worker in an
  internal `runtime` message (never stored, inputs emptied immediately).
- Usage limits count per browser: each computer applies its own.

## Checks to run (`correctly-security`)

- `chrome.storage.sync.get(null)` in the settings page console: no key in
  clear, only `correctly.v5.sync.*` items.
- In a content script console: `chrome.storage.sync` is not readable.
- `npm run build` (audit), `npm test`.
