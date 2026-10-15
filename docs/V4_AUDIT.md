# V4 audit — 2026-10-15

Initial branch: `feature/v3.1-installer`, HEAD `03cb122`, tags v1.0.0, v2.0.0, v3.1.0. Only V4.md and recap.md were untracked; both preserved. No reset, commit, tag or publication performed. Work continues on the existing branch to preserve the user's checkout.

Baseline observed: 150 tests in 10 files pass; lint and production build pass. Read README, recap, V4 specification, V3.1 report/installation/checklist, frontend editor/controller/storage/UI, backend tests and packaging scripts.

## Architecture and answers to the specification

1. `Application` follows one active field using composed document events and an observer; `field-detector`, `editor-adapter`, `text-extractor`, `replacement` implement editor discovery, UTF-16 selection mapping and native-value/Range editing. Switching fields disposes the previous controller and observer.
2. Existing V3.1 applies corrections **only on explicit suggestion/context-menu action**. It does not automatically replace words. Individual underlines and suggestions remain available.
3. `settings` in chrome.storage.local holds normalized preferences, dictionary and exact disabled hostnames. storage.onChanged restarts content applications; no typed text is persisted. Shortcuts use a separate versioned key.
4. Plain fields use native prototype setters and one input event, preserving selection and scroll. Rich editors prefer execCommand insertion, then a guarded single-text-leaf fallback. Native undo is not guaranteed; V4 provides a guarded explicit Undo button. V4 automatic/group mutations abstain on complex markup/framework editors.
5. Service-worker client calls unchanged local POST /v2/check, validates and normalizes LanguageTool matches to CorrectionMatch. It retains rule IDs and suggestions but no general confidence score. Automatic policy therefore allows only WHITESPACE_RULE, COMMA_PARENTHESIS_WHITESPACE and the bundled engine's observed CONSECUTIVE_SPACES with exactly one replacement, preserving every non-whitespace character and line break; no inferred spelling confidence.
6. Existing requestId and exact-text guards discard outdated replies; IME and open shadow roots are supported. V4 adds selection/focus checks for automatic application. The runtime message protocol cannot cancel in-flight background requests; revision invalidation remains the safe fallback.
7. Root npm commands build frontend into dist; backend Python/PyInstaller and Inno Setup scripts package Windows. Existing version is frontend 0.2.0/backend 3.1.0. V4 is a candidate until acceptance checks pass; no final v4.0.0 tag/version is assigned prematurely.
8. scripts/verify-browser.mjs uses a temporary browser profile and local fixtures with real LanguageTool. Authenticated sites and clean-Windows/reboot cannot be inferred from these fixtures and must be separately recorded.

## Deliberate limits

Space and safe punctuation trigger shortcuts synchronously after insertText. Newline insertion/paste/drop/composition do not trigger replacements; Tab/Enter are never intercepted, preserving chat submission. Search/email/url/tel and sensitive identifiers/autocomplete metadata are excluded from V4 mutations, while prior suggestion support remains outside protected fields. Complex rich structures are left intact. Corrupt shortcut data is retained in storage, disabled in content, and exposes a recovery error in options rather than silently overwriting it. Concurrent options pages refresh on storage changes; Web Locks coordinates read/merge/write across pages on supported Chrome/Brave, independent edits merge and same-entry conflicts are rejected. The fallback for browsers without Web Locks cannot guarantee simultaneous cross-page writes; those browsers are outside the verified target.
