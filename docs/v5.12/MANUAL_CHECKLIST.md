# Correctly V5.12 — Owner checklist (Chrome and Brave)

Load `dist/` unpacked (`npm run build`), with your own key and consent on.
Each step: note PASS / FAIL in both browsers. Generating may be billed.

## A — French article → Syrian Arabic summary

- [ ] Open a public French article; select one paragraph (not in an editor).
- [ ] Press Ctrl+M (then repeat with the handle): the paragraph is in the text box, the hint says it can be copied, never applied; no request yet (Statistics unchanged).
- [ ] Summary tab → Arabic, Syrian colloquial, Short, Key points → Generate summary **once**.
- [ ] Result in Syrian Arabic, right-to-left, bullet lines; Apply disabled; Copy works and the modal stays open.
- [ ] The article is unchanged. Statistics: one more request, task "Summary".

## B — Read-only text → translation (toolbar icon)

- [ ] Select Turkish or English page text, click the Correctly toolbar icon (SEL-006: the selection must still be there; if empty, report it).
- [ ] Translation tab → French → Generate: Copy enabled, Apply disabled, page unchanged.

## C — Editable text → summary, safe Apply

- [ ] Select text in a plain textarea; Summary → English → Generate.
- [ ] Apply replaces exactly the selection; modal hides; Undo offered for 5 s and restores.
- [ ] Repeat, but type in the textarea before Apply: Apply refused.

## D — Safety and persistence

- [ ] No selection → empty text box, nothing sent.
- [ ] Selection longer than 12,000 characters → empty with a notice; nothing cut.
- [ ] Limits page shows a "Summary" row (off, tracking); enable daily = 1: the second summary is refused locally.
- [ ] Settings → AI providers shows a "Summary" route (uses default until chosen).
- [ ] Existing keys, routes, limits, statistics and shortcuts are intact after updating from 5.11.
- [ ] Hide, reopen: fresh session on Correction. Switching tabs never sends.
- [ ] 200 % zoom and a narrow window: all four tabs and buttons reachable.
