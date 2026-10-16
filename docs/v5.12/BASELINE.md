# Correctly V5.12 — Baseline (WP0)

Recorded on 2026-10-16 before any V5.12 change. Windows 10, Node 24.21.0.

## Repository

- Branch `dev`, commit `939e99b` (V5.11: right-edge handle, unified
  three-tab modal, Ctrl+M).
- Dirty state at start (preserved, not touched): untracked
  `docs/v5.11/evidence/{limits,options,statistics}-{brave,chrome}-{360,900}.png`
  and the spec `v5/v5.12.md`.
- V5.11 prerequisite: **present** (handle `content/handle.ts`, modal
  `content/modal.ts`, `OPEN_MODAL`, `open-correctly` command, toolbar
  `action.onClicked` → `correctInTab(..., 'open')`). No blocker.

## Source map (actual paths)

| Concern                         | Path                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Manifest V3                     | `frontend/manifest.json` (no popup; `activeTab`, `scripting`)                |
| Service worker / dispatcher     | `frontend/src/background/index.ts` (sender + exact-shape guards)             |
| One-call controller             | `frontend/src/background/connection-controller.ts` (`generate()`)            |
| Gemini / OpenAI adapters        | `background/gemini-client.ts`, `background/openai-client.ts`, `transport.ts` |
| Task identity / routes          | `shared/models.ts` (`TASKS`, `SLOT_LABELS`), `shared/providers.ts`           |
| Quota journal                   | `shared/quota.ts` (policy, strict `parsePolicy`), `shared/quota-store.ts`    |
| Statistics events               | `shared/stats.ts`, `options/stats-ui.ts` (generic over `QUOTA_TASKS`)        |
| Modal shell, tabs, shared input | `content/modal.ts` (`MODAL_TABS`, per-tab `TabState`, `revision`)            |
| Selection snapshot / Apply      | `content/correction.ts` (`capture`, `applyBlocker`, `replaceRange`)          |
| Undo                            | `content/modal.ts` (`UndoToast`, 5 s)                                        |
| Context menu / commands         | `background/index.ts` (`installMenu`, editable contexts only; `onCommand`)   |
| Language catalog                | `shared/translate.ts` (`LANGUAGES`, `ARABIC_VARIANTS` msa/syrian)            |

## Baseline results

| Command                | Result                                      |
| ---------------------- | ------------------------------------------- |
| `npm test`             | PASS — 30 files, 574 tests                  |
| `npm run lint`         | PASS                                        |
| `npm run build`        | PASS (typecheck + 3 builds + audit)         |
| `npm run format:check` | PASS                                        |
| Browser smoke test     | not re-run at baseline (V5.11 report: PASS) |

## Risks identified

1. `parsePolicy` is strict (exact task keys): adding a task without a
   migration would make every stored V5.8–V5.11 policy unreadable and block
   all AI requests (fail closed). → migration in `parsePolicy`.
2. `capture()` refused plain page text by design (`NOTICES.notEditable`);
   read and write capabilities must stay separate.
3. V5.6 shortcut protection requires each placeholder exactly once; a
   summary legitimately drops text.
4. 2,000 code points (correction limit) is short for article summaries.

## Supported surfaces (honest)

Regular `http(s)` pages where `activeTab`/scripting works, in the top frame
or a same-origin frame the user acted in. Not promised: `chrome://`, Web
Store, built-in PDF viewer, cross-origin iframes, closed shadow roots,
canvas/image text (no OCR).
