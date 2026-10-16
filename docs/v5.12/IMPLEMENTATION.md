# Correctly V5.12 — Implementation, decisions, migration, security

## What changed

| Area                | Change                                                                                                                                                                                                                       |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Task identity       | `summary` added to `TASKS` (`shared/models.ts`): own route slot, quota task, statistics task, label "Summary". Never counted as `translation`.                                                                               |
| Contract            | `SUMMARIZE_TEXT` + `MAX_SUMMARY_CODE_POINTS = 12000` (`shared/contracts.ts`); `shared/summary.ts`: lengths, formats, exact-shape guard `isSummarizeTextRequest`, page-side `toSummaryResult`.                                |
| Prompt / parser     | `background/summary.ts`: one instruction (text = data, no browsing, detect source, write **directly** in target language/variant, length, format, honest `not_summarizable`), JSON schema per format, strict `parseSummary`. |
| Controller          | `ConnectionController.summarize()` → the existing `generate()` path: consent, frozen route, `admit` + `dispatch` before `fetch`, one call, no retry, settle once.                                                            |
| Worker dispatch     | `background/index.ts`: content-script sender + exact shape → `summarize`; the modal opens if any of the four actions has a usable route.                                                                                     |
| Read-only selection | `capture(doc, { readOnlyPage, max })` (`content/correction.ts`): one live, non-collapsed range of page text → snapshot `source: 'read_only_page'`, `field: null`, `copyOnlyReason`.                                          |
| Modal               | Fourth tab **Summary** (`content/modal.ts`): Summary language, Arabic variant (Arabic only), Length, Format; per-tab text limit; result rendered as text with `dir="auto"` and `lang`.                                       |
| Panels (V5.5)       | Translate / Translate & rewrite (shortcut) accept page text, copy only. Correction and Rewrite panels still refuse page text.                                                                                                |
| Shortcut protection | `Shield.restoreSome` / `noteSome` (`shared/protection.ts`): for summaries a placeholder may be dropped, never duplicated, altered or invented.                                                                               |
| Options page        | Summary route row and Summary limit rows appear automatically (generic over `TASKS`); help text for the Summary limit and the Translation card.                                                                              |
| Version             | 5.12.0 (`package.json`, lock, manifest, `audit-dist.mjs`, `verify-browser.mjs`; evidence now in `docs/v5.12/evidence`).                                                                                                      |

## Decisions

- **One request, no chunking.** Up to 12,000 code points (≈ 2,000 words) in
  one bounded request; longer text is refused with a message, never cut or
  split (spec §9.2). Correction/Reformulation/Translation keep 2,000.
- **No separate source-language field.** The model detects the source in the
  same call (spec §4.1); no detection request exists.
- **Defaults:** target language and Arabic variant = the saved Translation
  preferences (the "saved language preference" of spec §4.1); Medium,
  Paragraph. No new persisted preference → no settings migration needed.
- **Key points** come back as a JSON string array and are rendered as plain
  text lines starting with `• ` (never HTML or Markdown).
- **Suspicious summaries:** a number, URL or email present in the summary but
  not in the source disables Apply (Copy stays). Dropping one is normal.
- **Copy-only page text everywhere.** Page text in Correction or
  Reformulation tabs can still be processed from the modal and copied; Apply
  is impossible because the snapshot has no field (`NOTICES.readOnlyPage`).
- **Context menu unchanged** (still `editable` contexts only). Read-only page
  text is reached through the modal (handle, Ctrl+M, toolbar) and the
  optional Translate shortcut. Adding a `selection` menu context was not
  needed for the spec's scenarios.
- **Selection freshness.** The selection is captured synchronously when the
  modal opens (all three triggers): the handle keeps the page selection
  (`mousedown` prevented), the toolbar icon and Ctrl+M do not collapse it.
  Nothing is cached between openings; if no valid selection exists the
  modal opens empty.

## Migration (WP7)

- **Routes:** a V5.7–V5.11 store has no `routes.summary`; it parses as `null`
  = "use the default route". Nothing is rewritten in storage; no key,
  profile or route changes.
- **Usage limits:** `parsePolicy` adds `tasks.summary` (daily/weekly/monthly
  **off**, maxima copied from the global caps) when, and only when, the key
  is absent. All other caps, the revision, counters, operations and history
  are untouched. A damaged `summary` entry or an unknown task key still fails
  closed. The first save from the Limits page writes the migrated policy.
- **IndexedDB schema:** unchanged (v2). Statistics read `task: 'summary'`
  rows generically.
- **Rollback to 5.11.0:** a policy saved by 5.12 contains `tasks.summary`,
  which 5.11's strict parser rejects (requests fail closed with "usage limits
  unavailable"). To roll back, reset the limits from the Limits page of 5.11
  or keep 5.12. Routes saved with a `summary` slot are ignored by 5.11.

## Security and privacy notes

1. Keys stay in the worker; the page sends only text and allowlisted option
   IDs (exact key set, no model/prompt/provider/URL field).
2. The selected page text is untrusted data: sent as its own message, never
   interpolated in the instruction; the instruction says to treat embedded
   instructions as content.
3. No whole-page reading: only `Selection.toString()` of exactly one range;
   no `innerText`, siblings, hidden nodes or clipboard reads. Multi-range or
   collapsed selections are refused.
4. Apply is impossible on read-only page text (no field in the snapshot);
   no article DOM is ever mutated.
5. Exactly one generation per Generate click: in-flight guard per tab,
   controls locked while pending, stale results dropped (text revision,
   token, Hide).
6. Quotas: `summary` is a separate task scope; global, provider and key caps
   apply too; admission happens before `fetch`, fail closed.
7. Statistics store task/provider/model/profile/tokens only; no source,
   summary, prompt, key or URL (test STA-003).
8. No new permission, host or dependency; `dist/` audit passes.
