# Correctly V5.10 — Owner checklist (release gate)

These steps could not be automated. They decide GO or NO-GO
([V5.10_REPORT.md](V5.10_REPORT.md)). Use a **new** Chrome profile and a
**new** Brave profile, and the folder unzipped from
`release/Correctly-V5.10-Extension.zip` (check its SHA-256 first). Use
harmless test sentences only.

Write PASS, FAIL or NOT RUN next to each step, with the browser.

## A. Without a key (Chrome and Brave)

1. Load the folder unpacked. In the extension details, the permissions are
   exactly those of [USER_GUIDE.md §1](USER_GUIDE.md). (BRW-001/002)
2. Click the toolbar button on a normal page: the settings open; no request
   in the service worker's Network tab. (BRW-003/004, UX-001)
3. Open `chrome://extensions` (or `brave://extensions`) and press Alt+Shift+C:
   nothing is read; the settings may open. (BRW-023/024)

## B. With a test key and a low limit (Chrome and Brave)

Set **Usage limits** to 5 per day total before starting. Each step below
sends at most one paid request: stop after about 10.

4. In a plain textarea, type
   `Je suis pas disponible demain parcque j'ai un rendez vous.`, select it,
   press **Alt+Shift+C**. One preview; the textarea is unchanged until
   **Apply**; **Undo** restores it. (BRW-005/006, AI-001)
5. Same with right-click **Correctly → Correct selected text**, then
   **Cancel**: text unchanged. (BRW-007/008)
6. Start a correction and type a letter before the answer: **Apply** is
   disabled with a reason; **Copy** works. (EDT-005)
7. Rewrite with Formal + Professional + Friendly + Funny: four labeled
   cards, the limit count goes up by **one**. (AI-010)
8. Translate French → Arabic, **Syrian colloquial**: right-to-left result,
   reads as Syrian dialect, not Modern Standard. (AI-017)
9. Switch the Default route from Gemini to OpenAI, correct again: the
   statistics show one request per provider. (API-013)
10. Delete the routed key, try again: a "deleted key" message, no request to
    the other provider. (SEC-015)

## C. Limits, statistics, restart

11. Lower the limit to the current count: the next action says the limit is
    reached and nothing is sent. Stop the worker (`chrome://extensions` →
    service worker → stop) and try again: still refused. (BRW-017/018)
12. **Statistics**: requests, results and applied edits match what you did;
    cost is an estimate, never `$0.00` while requests were sent. Export CSV
    and JSON and search them for your test sentence and your key: absent.
    (STA-024)
13. **Delete statistics history**, then try an action: the limit is still
    reached. (STA-025)

## D. Shortcuts and recovery

14. Turn on **Text shortcuts**, add `bjr` → `Bonjour`, go offline, type
    `bjr ` in a textarea: it expands. (BRW-015/016)
15. Export the shortcuts, delete one, import the file: preview, then it is
    back. (MIG-020)
16. Load the V5.9 folder over V5.10, reopen the settings: keys, routes,
    limits, statistics and shortcuts are kept. Load V5.10 again.
    (REL-018, BRW-025/026)

## E. Accessibility (one browser)

17. Settings at 200 % zoom in dark mode: nothing essential clipped.
    (UX-018)
18. Keyboard only: save a key, open a rewrite, choose a card, Apply or
    Cancel with Esc. (UX-002, UX-011)
