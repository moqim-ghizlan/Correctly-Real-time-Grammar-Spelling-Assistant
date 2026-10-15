# V5.1 baseline (Phase 0)

Recorded 2026-10-15 before any V5.1 change.

## Repository state

| Item        | Value                                                                        |
| ----------- | ---------------------------------------------------------------------------- |
| Root        | `C:/Users/moqim/Desktop/work/Correctly-Real-time-Grammar-Spelling-Assistant` |
| Branch      | `dev` (V5.1 work on `feat/v5.1-foundation`, created from `dev`)              |
| HEAD        | `4c95233` "version 3 and 4 is ready to shippppppppp"                         |
| Tags        | `v1.0.0`, `v2.0.0`, `v3.1.0`, `v4.0.0` (= HEAD)                              |
| Uncommitted | only `?? v5/` (the V5 specifications) — nothing overwritten                  |
| Node / npm  | v24.21.0 / 11.19.0                                                           |
| OS          | Windows 10 Home 10.0.19045                                                   |
| Browsers    | Brave 155.1.97.57 (Chromium 155), Chrome 155.0.8059.40                       |

## Baseline commands (V4 code, before edits)

| Command         | Result                                                                            |
| --------------- | --------------------------------------------------------------------------------- |
| `npm run build` | PASS — `tsc`, two Vite builds (pages/worker + content script), `verify-build.mjs` |
| `npm test`      | PASS — 11 files, 223 tests                                                        |
| `npm run lint`  | PASS — no findings                                                                |

The V4 backend tests (pytest) were not run: the owner decided V5 drops the
backend entirely (sources kept in Git, tag `v4.0.0`).

## What V4 contained (inventory)

- `frontend/manifest.json` — the only manifest, copied to `dist/` by the
  `manifest` plugin of `frontend/vite.config.ts`. V4 permissions: `storage`,
  `contextMenus`, `activeTab`; hosts `http://127.0.0.1/*`, `http://localhost/*`;
  a content script on `http://*/*` and `https://*/*`; popup and options page.
- `frontend/src/` — LanguageTool client (`127.0.0.1:8081`), content scripts
  (underlines, popup, sentence correction, shortcuts), context menu, popup,
  options (settings + shortcuts).
- `backend/` — Python Windows server/tray, PyInstaller spec, vendored Java
  runtime and LanguageTool (ignored build outputs ~776 MB).
- `installer/`, `createSetup.cmd`, Python/PowerShell scripts — Windows setup.
- `artifacts/` (ignored, ~8.7 GB) — V3/V4 builds, EXEs, Java runtimes.

Searches for `8081`, `127.0.0.1`, `localhost`, `LanguageTool`, `java`,
`CorrectlyServer`, `content_scripts` matched only V4 runtime files listed above.

## Decisions

1. **Clean V5 start** (owner request): V4 runtime code is removed from the
   working tree, not ported. History stays in Git (`v4.0.0`).
2. **Reused**: Vite + TypeScript strict + Vitest/jsdom + ESLint/Prettier
   tooling, the manifest-copy plugin, the icons, the `verify-build` idea.
3. **Not reused**: every V4 module (LanguageTool, content scripts, popup,
   context menu, shortcuts UI). Shortcut sources/tests remain in `v4.0.0` for
   V5.6.
4. **V4 browser data is never touched**: V5 uses only `correctly.v5.*` keys.
5. `artifacts/` and ignored `backend/` build outputs are **not** in Git; they
   are left on disk for the owner to delete or archive.
