# Correctly 5.14 — Sync architecture

Contract, storage keys and decision rules: [`v5/v5.14_done.md`](../../v5/v5.14_done.md).
This page explains how the pieces fit.

## Fixed extension ID

`chrome.storage.sync` is stored per extension ID. An unpacked extension gets
an ID computed from its folder path, so each computer had a different one.
Since 5.14 the manifest carries a public `"key"`:

- extension ID: **`annnnjfiddfooccihpgebjnipppaejpo`** (seen in the browser
  smoke test, `docs/v5.14/evidence/browser-brave.json`, step M3);
- the private key `correctly-key.pem` was generated outside the repository
  (`C:\Users\moqim\correctly-keys\`). It is only needed to sign a `.crx` or
  publish to the Chrome Web Store with the same ID. **Back it up**; losing it
  breaks nothing today. `*.pem` is git-ignored and refused in `dist/`.
- `scripts/audit-dist.mjs` checks that `manifest.key` is exactly
  `EXTENSION_PUBLIC_KEY`.

## Flow

```
Settings page                     Service worker (SyncEngine)            Other computer
  writes storage.local  ───────►  onChanged('local')                         │
  (shortcuts, settings…)          hash ≠ base? → chunks → storage.sync.set   │
                                                     │  browser sync          │
                                                     └──────────────────────► onChanged('sync')
                                                                             complete + hash ok?
                                                                             → normalize → merge
                                                                             → storage.local.set
                                                                             → settings page refreshes
```

Triggers: `storage.onChanged` (`local` on a domain key or `syncPrefs`;
`sync` on a `correctly.v5.sync.*` key), worker start (`registerServiceWorker`
and `runtime.onStartup`), and the page's messages. Every run is serialized
and compares everything again, so nothing is lost when Chrome stops the
worker. When sync is off the engine never calls `storage.sync` and does not
write anything either.

## Files

| File                                     | Role                                                                                                    |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `frontend/src/shared/sync.ts`            | pure: keys, normalizers, canonical JSON, SHA-256, chunking, payloads, merge, encryption, message guards |
| `frontend/src/background/sync.ts`        | `SyncEngine`: reads/writes both areas, decisions, push/apply, passphrase, restore, clear                |
| `frontend/src/background/index.ts`       | `setAccessLevel(TRUSTED_CONTEXTS)` on `storage.sync`, listeners, messages                               |
| `frontend/src/options/sync-ui.ts`        | "Sync" page: choices (`syncPrefs`), statuses, passphrase form, restore, clear                           |
| `scripts/i18n-options.mjs`               | static text of the page (fr/en) → `options.html`, `messages-html.ts`                                    |
| `frontend/src/options/messages.ts`       | dynamic texts (`sync` section, fr/en)                                                                   |
| `frontend/tests/helpers/fake-storage.ts` | `FakeSyncArea` (Chrome quotas, change log replayed between "computers"), `FastFakeStorage`              |

## Why a three-way merge for shortcuts

Each computer keeps the last list it agreed with the others (`syncBase`).
For every shortcut ID: a side that did not touch it takes the other side's
version — an edit, or its absence (a deletion). So deletions need no
tombstones. When both sides changed the same shortcut, the side edited just
now wins (or, for two parallel versions, the same winner is chosen on both
computers); the loser's whole list is kept in `syncBackup` and the page
offers **Restore**. A trigger added on both computers under different IDs
keeps one entry.

Heads carry the revisions they were built on (`history`). A head that does
not build on what this computer agreed (for instance another computer's very
first sync) is merged against an empty base, so nothing in it is read as a
deletion. An empty computer never pushes an empty list.

## Size

Chrome allows 102,400 bytes in all and 8,192 per item. Correctly writes
chunks of at most 7,000 bytes of JSON-escaped UTF-8 (never splitting a
character) and stops at 95,000 bytes for all domains together. A few hundred
short shortcuts fit; the local maximum (500 × 2,000 characters) does not.
The page shows the space used.
