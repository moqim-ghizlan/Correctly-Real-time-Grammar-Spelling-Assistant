# V5.1 architecture

```text
Options page (extension origin)          Service worker (only network caller)
  settings-ui.ts                           index.ts            sender + shape checks
   ├─ reads/writes correctly.v5.settings   connection-controller.ts  one test at a time
   ├─ reads usage / connection             usage-guard.ts      serialized ledger
   └─ sendMessage({type: TEST_CONNECTION}) gemini-client.ts    fetch + timeout + parse
            │  (no key, no data)                    │ x-goog-api-key header
            └──────────────► chrome.runtime ───────►│
                                                    ▼
                         https://generativelanguage.googleapis.com/v1beta/
                             models/{allowlisted id}:generateContent
```

## Files

| File                                                                        | Responsibility                                                             |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `frontend/manifest.json`                                                    | MV3 manifest: `storage` + Gemini host only, no content script, strict CSP  |
| `src/background/service-worker.ts`                                          | bundle entry, calls `registerServiceWorker()`                              |
| `src/background/index.ts`                                                   | message listener (trusted sender + exact message shape), toolbar → options |
| `src/background/connection-controller.ts`                                   | TEST_CONNECTION flow, outcome recording                                    |
| `src/background/usage-guard.ts`                                             | daily ledger, reserve-before-dispatch, serialized                          |
| `src/background/gemini-client.ts`                                           | URL builder, fixed request, response/error parsing                         |
| `src/options/options.html`, `index.ts`, `settings-ui.ts`, `settings-ui.css` | settings page (sections A–E)                                               |
| `src/shared/contracts.ts`                                                   | `TEST_CONNECTION`, `ConnectionResult` DTO                                  |
| `src/shared/errors.ts`                                                      | error codes, fixed user copy, retryable flags                              |
| `src/shared/models.ts`                                                      | Gemini model allowlist                                                     |
| `src/shared/settings.ts`                                                    | schemas, defaults, validation, normalization                               |
| `src/shared/storage.ts`                                                     | typed `chrome.storage.local` adapter, namespaced keys                      |
| `src/shared/local-date.ts`                                                  | local calendar date                                                        |
| `scripts/audit-dist.mjs`                                                    | static audit of `dist/` (manifest, permissions, secrets, legacy)           |

## Gemini request

```http
POST /v1beta/models/gemini-3.1-flash-lite:generateContent
Host: generativelanguage.googleapis.com
Content-Type: application/json
x-goog-api-key: <key from chrome.storage.local>

{"contents":[{"role":"user","parts":[{"text":"Reply with OK only."}]}],
 "generationConfig":{"temperature":0,"maxOutputTokens":128}}
```

- Endpoint and `x-goog-api-key` header verified on https://ai.google.dev/api
  and https://ai.google.dev/api/generate-content (2026-10-15). A real request
  with a dummy key from Chrome and Brave returned HTTP 400 / `API_KEY_INVALID`
  (see `evidence/`), proving the endpoint path and header are accepted.
- `fetch` options: `credentials: 'omit'`, `redirect: 'error'`,
  `cache: 'no-store'`, `referrerPolicy: 'no-referrer'`, 15 s `AbortController`
  timeout. **No retry**, ever.
- `maxOutputTokens: 128` (not 32): Gemini 3.x Flash-Lite models think at a
  minimal level by default and thinking tokens count against this limit; 32
  could leave no room for the answer. It bounds tokens; it is not a money cap.
  `thinkingConfig` is not sent because its `generateContent` form is not
  documented on the pages checked.
- Success = first candidate has non-empty, non-thought text; prompt not
  blocked. Empty/blocked/malformed → `INVALID_RESPONSE`. The sample shown is
  cleaned and cut to 40 characters.
- Errors: `API_KEY_INVALID`/`API_KEY_EXPIRED` reason or 401 → `INVALID_KEY`;
  403 or 400 `FAILED_PRECONDITION` → `PERMISSION_DENIED`; 404 →
  `MODEL_UNAVAILABLE`; 429 → `RATE_LIMITED`; other → `PROVIDER_ERROR`. Only the
  status code and Google enum fields are read; provider text is never shown.

## Model choice

Allowlist (verified 2026-10-15 on the official
[models](https://ai.google.dev/gemini-api/docs/models) and
[pricing](https://ai.google.dev/gemini-api/docs/pricing) pages, both "stable"):

| ID                      | Paid price per 1M tokens (in / out) | Role                          |
| ----------------------- | ----------------------------------- | ----------------------------- |
| `gemini-3.1-flash-lite` | $0.25 / $1.50                       | **default** (cheapest listed) |
| `gemini-3.5-flash-lite` | $0.30 / $2.50                       | option                        |

Availability for a given key/project is only proven by a successful test.
A stored model that is not allowlisted falls back to the default (the
cheapest); the worker never switches models on its own after a failure.

## Storage (all `chrome.storage.local`, never `sync`)

| Key                       | Writer                                    | Content                                                                                  |
| ------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- |
| `correctly.v5.settings`   | options page                              | `{schemaVersion, gemini:{apiKey, modelId, keyRevision}, safety:{dailyTestAttemptLimit}}` |
| `correctly.v5.connection` | worker (cleared by options on key change) | last check time/result/model/key revision, last success                                  |
| `correctly.v5.usage`      | worker only                               | today's `DailyUsageRecord`                                                               |

Deviation from the plan's suggested shape: `lastSuccessfulCheckAt` /
`lastSuccessfulModelId` live in `correctly.v5.connection`, not in the settings
object, so the page and the worker never write the same key (no lost update).
`keyRevision` increments on each save/removal; a result is shown as
_Connected_ only if it belongs to the current revision and model — this links
a result to a key without storing anything derived from the key.

Every read is normalized (corrupt values → safe defaults). V4 keys
(`settings`, shortcuts…) are never read, rewritten or cleared.

## Usage guard semantics

- An attempt is counted **before** `fetch` and persisted; it stays counted on
  failure, timeout or worker death.
- Not counted: no key, offline (`navigator.onLine === false`), cap reached.
- One test runs at a time (worker queue), and all ledger updates go through a
  second serialized chain: N simultaneous requests from any number of tabs
  never dispatch more than the remaining capacity.
- Local day = `Intl.DateTimeFormat('en-CA')` parts in the browser timezone
  (not `toISOString()`, which is UTC). A record for another date is replaced
  by a fresh one. If the day changes during a request, its outcome is not
  added to the new day. Timezone changes are handled best-effort (the date is
  re-evaluated on each call).
- The cap is read at reservation time, so lowering it blocks immediately.

## Lifecycle

- Nothing runs on install, startup or page open except storage reads.
- Worker suspension mid-request: the attempt is already persisted; the page
  receives an error (port closed) and shows a retry message; nothing replays.
