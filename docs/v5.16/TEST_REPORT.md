# Correctly 5.16.0 — Test report

Date: 2026-10-21. Windows 10, Node 22, branch `dev`. Baseline before the
milestone (5.15.0): 42 files, 741 tests passing, `dist/` audit passing.

## Owner decisions (v5/v5.16_done.md §3)

The owner said "go" without choosing: the spec's recommendations were
applied, except D3 (see below).

| #   | Decision                                                                                                                                                                                                                                                               |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | §1.4 catalog: 39 languages (the 6 of V5.5 + 33).                                                                                                                                                                                                                       |
| D2  | Favorites + A→Z.                                                                                                                                                                                                                                                       |
| D3  | Arabic (MSA, Syrian, Egyptian, Moroccan, Lebanese, Gulf), Portuguese (Brazil, Portugal), Chinese (Simplified, Traditional) **and Kurdish (Kurmanji, Sorani)**: the catalog lists Kurdish as "RTL for Sorani", which only works with a variant. Serbian has no variant. |
| D4  | Default favorites: the six V5.5 languages.                                                                                                                                                                                                                             |
| D5  | No "quality may vary" note.                                                                                                                                                                                                                                            |

## Summary

| Check                                                      | Result                                                                                                                                    |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run format:check`                                     | PASS                                                                                                                                      |
| `npm run lint`                                             | PASS                                                                                                                                      |
| `npm test`                                                 | PASS — 43 files, 765 tests                                                                                                                |
| `npm run build` (typecheck, Vite, audit of `dist/`)        | PASS — 11 files                                                                                                                           |
| `npm run package`                                          | PASS — `release/Correctly-V5.16-Extension.zip`, 161,758 bytes, SHA-256 `e7fb48473221d0496646e08e061bc46fcdacbbd1bc4c4dfd8b3b2fdf4d4b4b04` |
| `node scripts/verify-browser.mjs` (real Brave, dummy keys) | PASS — 28 steps, including the new **T16**; evidence in `docs/v5.16/evidence/` (`translation-rtl-brave.png`)                              |
| Owner manual checklist                                     | **NOT TESTED** — [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)                                                                     |
| Live key (real translations into the new languages)        | **BLOCKED** (owner's key)                                                                                                                 |
| Catalog review by hand (names, native names, direction)    | Done once by the agent while writing it; a native-speaker check is not possible here                                                      |

## New and updated automated tests

`frontend/tests/unit/languages.test.ts` (16), matrix §10: **L1** every
catalog ID accepted by both guards (as source and target), unknown or
malformed IDs refused; **L2** a variant is valid only for its own language
and required when the language has variants; **L3** instructions use the
English name and the variant prompt, never the user's text (translation and
summary); **L4** a 5.15 preference keeps its Arabic variant, unknown or
misplaced IDs fall back, favorites unique, ≤ 12; **L5** favorites first,
then A→Z in French and English (`Intl.Collator`); **L6** `isRtl`/`langTag`
(Arabic, Hebrew, Persian, Urdu, Sorani RTL; Kurmanji LTR); **L8** every
language and variant has an English and a French name; **L9** a 5.16
payload read with the 5.15 rules keeps a valid target and Arabic variant (a
new language falls back to English), and a 5.15 payload read by 5.16 keeps
its Arabic variant with default favorites.

Integration: `content-modal.test.ts` (4 new) — favorites group and French
names in the modal; Japanese then Persian, Hebrew, Urdu: one request each,
`dir="rtl"` only for RTL targets, `lang` set (**L6/L7**); the variant menu
shows only the target's variants, preselects the saved one and remembers
the session's choice per language, Chinese Traditional → one request; Summary
in Korean → one request. `selection-button.test.ts` (1 new) — bubble:
favorites first, Chinese Traditional → one request, Persian result RTL.
`settings-ui.test.ts` (3 new) — favorites checkboxes (default six, saved in
the order added, 13th refused), each language keeps its own variant, the
English page sorts and names in English.

Updated for the new shape (`variants`, `favorites`; label "Variant"):
`translate.test.ts`, `summary.test.ts`, `settings.test.ts`,
`content-translate.test.ts`, `content-summary.test.ts` (Arabic summary now
`dir="rtl"`, `lang="ar-SY"`), `i18n.test.ts`, `service-worker.test.ts`,
`shortcut-expansion.test.ts`.

## Browser smoke test

New step **T16**: in the modal (real `content.js`, stubbed worker) the
target menu shows the favorites first, opening Translation sends nothing,
Generate sends exactly one `translateText` to Persian, and the result's
computed `direction` is `rtl`. All 27 earlier steps still pass.

## Also fixed

`scripts/package.mjs` wrote `Correctly-V5.14-Extension.zip` inside every
`.sha256` file (5.15 included); it now writes the real zip name, so
`sha256sum -c` works.

## Not covered

- Real translation quality per language and variant (needs the owner's key).
- Two computers on 5.15 and 5.16 with sync (checklist row 16).
