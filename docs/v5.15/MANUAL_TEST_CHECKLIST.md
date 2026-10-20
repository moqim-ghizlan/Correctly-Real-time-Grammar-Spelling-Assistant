# Correctly 5.15.0 — Manual test checklist

Load `dist/` (or the 5.15 zip), click **Reload** on the extension card,
reload the test tabs. Turn on Settings → Getting started → "Translate button
on selected text" (accept the site access). Note PASS / FAIL / NOT TESTED /
BLOCKED.

| #   | Scenario                                               | Expected                                                                              | Result     |
| --- | ------------------------------------------------------ | ------------------------------------------------------------------------------------- | ---------- |
| 1   | Wikipedia article: select 1–5 words with the mouse     | button just below the end of the selection; nothing sent (Statistics: no new request) | NOT TESTED |
| 2   | Click the button                                       | bubble, translation into the default language, one request counted                    | NOT TESTED |
| 3   | In the bubble: To = Arabic, variant Syrian, Translate  | Syrian Arabic, right-to-left, one more request; default language unchanged            | NOT TESTED |
| 4   | Copy, then "Open in Correctly"                         | text copied; window on Translation with the same text, nothing sent                   | NOT TESTED |
| 5   | Select a whole paragraph (> 5 words), click the button | window on Translation, translation starts at once (one request)                       | NOT TESTED |
| 6   | Gmail compose or a textarea: select words              | button appears; bubble works; the field is never changed by the bubble                | NOT TESTED |
| 7   | Password field, Correctly's own window                 | no button                                                                             | NOT TESTED |
| 8   | Escape, click elsewhere, scroll, typing                | button disappears                                                                     | NOT TESTED |
| 9   | Consent off, or no key/route                           | the bubble shows the usual message; nothing sent                                      | NOT TESTED |
| 10  | Pause all AI (Usage limits) then click the button      | "AI requests are paused" in the bubble; nothing sent                                  | NOT TESTED |
| 11  | Turn the setting off                                   | button gone at once in open tabs; site access released if nothing needs it            | NOT TESTED |
| 12  | Dark and light system themes                           | button and bubble readable in both                                                    | NOT TESTED |
| 13  | Chrome's own translate bubble on the same page         | both usable, neither hidden                                                           | NOT TESTED |
| 14  | Brave                                                  | same as 1–5                                                                           | NOT TESTED |
