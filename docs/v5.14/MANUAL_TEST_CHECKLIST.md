# Correctly 5.14 — Manual test checklist (two computers)

Chrome refuses the same Google account in two profiles of one Chrome. To get
"two computers": **Chrome stable + Chrome Beta or Canary** on the same PC
(simplest), two real PCs, or a PC and a virtual machine. Both must have
browser sync on, **including extensions**. `chrome://sync-internals` shows
whether extensions sync and when.

Load `dist/` (or the 5.14 zip) in both. Note each result as PASS / FAIL /
NOT TESTED / BLOCKED.

| #   | Scenario                                                                                                                                     | Expected                                                                    | Result                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| 1   | `chrome://extensions` on A and B                                                                                                             | same ID `annnnjfiddfooccihpgebjnipppaejpo`                                  | NOT TESTED                             |
| 2   | Sync on A (shortcuts ticked), add 3 shortcuts; sync on B                                                                                     | the 3 shortcuts appear on B (note the delay)                                | NOT TESTED                             |
| 3   | Edit one and delete one on B                                                                                                                 | same on A                                                                   | NOT TESTED                             |
| 4   | Settings ticked; change the interface language on A                                                                                          | B switches language                                                         | NOT TESTED                             |
| 5   | Turn the handle on on A                                                                                                                      | B's handle stays off until turned on (and access granted) on B              | NOT TESTED                             |
| 6   | Keys ticked on A, set a passphrase; on B tick keys, Unlock with a wrong passphrase, then the right one; Generate on B (live key: owner only) | wrong refused; right one copies keys and routes; generation works on B      | NOT TESTED                             |
| 7   | Network off on A, edit a shortcut; edit the same one on B; network back on A                                                                 | one version everywhere; "Restore" offered on the computer whose change lost | NOT TESTED                             |
| 8   | Import enough long shortcuts to exceed 100 KB                                                                                                | "Too large" message, nothing broken, the local list complete                | NOT TESTED                             |
| 9   | Turn browser sync off (browser settings)                                                                                                     | Correctly keeps working locally, no error                                   | NOT TESTED                             |
| 10  | Uninstall and reinstall the extension on A                                                                                                   | note whether synced data comes back (browser behaviour)                     | NOT TESTED                             |
| 11  | **Brave**: repeat 1–3 (Brave Sync)                                                                                                           | note honestly; if FAIL, say it on the site                                  | NOT TESTED                             |
| 12  | Fresh profile, not signed in: open Settings → Sync                                                                                           | page shown, off by default, no new network request                          | PASS (automated smoke test Y01, Brave) |
| 13  | Settings page console: `chrome.storage.sync.get(null)` after step 6                                                                          | only `correctly.v5.sync.*`; no key in clear                                 | NOT TESTED                             |
| 14  | Content script console (any page with the handle): `chrome.storage.sync.get(null)`                                                           | refused (trusted contexts only)                                             | NOT TESTED                             |
| 15  | "Delete synced data" on A (sync off on B first)                                                                                              | sync storage emptied; A and B keep their local data                         | NOT TESTED                             |

## Migration from 5.13 (owner, once per computer)

1. In 5.13: Settings → Text shortcuts → **Export** (JSON); Statistics →
   export CSV/JSON if you want an archive.
2. Note your keys' names, routes and limits.
3. Remove 5.13, load 5.14 (new ID: the extension starts empty).
4. Import the shortcuts, enter keys, routes and limits again.
5. Turn sync on on the first computer, then on the others (they receive
   instead of sending, as long as they are empty).
