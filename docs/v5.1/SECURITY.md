# V5.1 security, cost and privacy

V5.1 is a **personal-use, bring-your-own-key** extension. The browser is not
a vault: a key in `chrome.storage.local` can be read by anyone with access to
the profile, browser debugging tools, malware, or a compromised extension.
The key is **not encrypted** and nothing in the UI claims otherwise.

## Controls

| Control                                                                                                                       | Where                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Key only in `chrome.storage.local` (never `sync`), namespaced `correctly.v5.settings`                                         | `shared/storage.ts`                  |
| Key field `type=password`, Show/Hide toggle, hidden again on tab hide, cleared on page leave and after save                   | `options/`                           |
| Status shows only Configured / Connected — no masked suffix                                                                   | `settings-ui.ts`                     |
| Replace and Remove require confirmation; an invalid replacement never deletes the old key                                     | `settings-ui.ts`                     |
| Key never in messages: UI sends `{type}` only; replies are rebuilt from an allowlist of fields                                | `contracts.ts`, `toConnectionResult` |
| Key only in the outgoing `x-goog-api-key` header (not the URL)                                                                | `gemini-client.ts`                   |
| Worker accepts messages only from this extension's own pages, exact shape, one action                                         | `background/index.ts`                |
| No content scripts, no `web_accessible_resources`, no `externally_connectable`                                                | manifest + audit                     |
| Permissions: `storage`; hosts: `https://generativelanguage.googleapis.com/*` only                                             | manifest + audit                     |
| CSP: `default-src 'self'; script-src 'self'; object-src 'none'; connect-src 'self' https://generativelanguage.googleapis.com` | manifest                             |
| Model ID allowlisted and pattern-checked before entering the URL                                                              | `models.ts`, `gemini-client.ts`      |
| No logging in the worker or page code; provider error text never shown or stored                                              | all                                  |
| Build audit fails on key-shaped strings (`AIza…`), the test sentinel, `.env`, binaries, `eval`, localhost/LanguageTool/Java   | `scripts/audit-dist.mjs`             |
| `.env*`, `*.pem`, `release/`, `dist/` ignored by Git                                                                          | `.gitignore`                         |

## Cost

- Requests only on an explicit click; never on install, page open, typing or
  settings changes (tested).
- Fixed tiny prompt, `maxOutputTokens: 128`, 15 s timeout, one test at a
  time, no automatic retry (not even on 429/5xx).
- Local cap (default 20/day, 1–100). It is **not** a billing limit: it does
  not see other profiles/browsers/apps using the same Google project, and it
  can be reset by clearing extension data. Google project spend caps are
  experimental and can lag (~10 min) — see
  https://ai.google.dev/gemini-api/docs/billing.

## Privacy

V5.1 sends only `Reply with OK only.`. It reads no page text, selection,
clipboard or history. V5.2+ must add explicit consent before sending writing.

## Threat model

| Threat                           | Mitigation                                                                     | Residual risk                         |
| -------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------- |
| Key leaked in bundle/logs/Git    | no embedded key; audit scans `dist/`; no logging; `.gitignore`                 | owner pasting a key into source       |
| Malicious page spoofing messages | no content script; sender must be this extension's origin; exact message shape | none known                            |
| Other extension messaging        | `onMessageExternal` not used; `sender.id` checked                              | —                                     |
| Over-broad permissions           | `storage` + one HTTPS host; audited at build                                   | —                                     |
| User request flood               | serialized queue, local daily cap, disabled button while busy                  | cap is local only                     |
| Lost network                     | offline check before reserving; network errors → `NETWORK_ERROR`               | —                                     |
| Damaged storage data             | every read normalized, corrupt → defaults                                      | a corrupt ledger resets today's count |
| Chrome vs Brave / profiles       | each profile has its own key and counter (documented)                          | —                                     |
| Model deprecation                | allowlist + 404 → `MODEL_UNAVAILABLE` guidance                                 | allowlist needs updates               |
| Destructive migration            | V5 never touches V4 keys                                                       | —                                     |
| Worker suspended mid-request     | attempt persisted before fetch; 15 s timeout; no replay                        | the attempt is counted                |
| Local profile access / malware   | out of scope; warned in UI                                                     | key readable locally                  |
