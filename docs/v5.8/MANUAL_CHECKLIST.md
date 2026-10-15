# V5.8 manual checklist (owner)

Before you start:

1. Run `npm run build`.
2. Click **Reload** in `chrome://extensions` (and in Brave).
3. Use a test browser profile if you can.
4. Real AI requests may be billed: set spend caps at Google and OpenAI first.

Never paste a real key into screenshots or bug reports.

## A. Upgrade from V5.7

1. Open the settings → **Usage limits**. Expected:
   - **Total → Daily** shows your previous daily limit (20 by default).
   - Today's count from V5.7 is still there.
   - A note says earlier days of the week and month are unknown.
2. **AI providers**, routes, text shortcuts, rewrite styles and the
   translation defaults (including Syrian Arabic) are unchanged.

## B. Configure and persist

1. Set:
   - Total: daily 5, weekly 10, monthly 20;
   - Correction: daily 3;
   - Rewrite: daily 2.
2. Click **Save limits**.
3. Close and reopen the settings. Expected: same numbers; the reset times
   are shown with your time zone.
4. Open the settings in two tabs. Save a change in tab 1, then a different
   one in tab 2. Expected: tab 2 says it was changed in another tab, and
   nothing is overwritten.

## C. Correct until the limit

1. Correct a sentence three times (Apply or Copy once). Expected: each
   correction is one request; Apply and Copy add nothing.
2. Watch the warnings in the preview: they should come at 80 % and 95 % of a
   limit, then 100 % (exact counts depend on the limits you set).
3. Correct a fourth time. Expected:
   - "Daily correction request limit reached (3 / 3). No request was sent.";
   - a **Manage limits** button that opens the section.
4. Route Correction to your other key or provider, and try again. Expected:
   still blocked.
5. Type `bjr ` with shortcuts on: it still expands.

## D. Rewrite and translation

1. Rewrite in Formal + Friendly + Professional + Funny. Expected: one request
   in the Rewrite counts.
2. Translate French → Arabic (Syrian), then Translate & rewrite. Expected:
   one request each, in Translation and in Translate & rewrite.
3. When the total daily limit (5) is reached, every action is refused before
   sending.

## E. Pause, clock, restart

1. Tick **Pause all AI requests**. Expected: a correction is refused ("paused")
   and text shortcuts still work. Untick it.
2. In `chrome://extensions`, open the service worker and stop it. Then
   restart the browser. Expected: the counts and limits are unchanged.

## F. Privacy

1. Click **Manage limits** in a page preview. Expected: only the Correctly
   settings open.
2. The section never shows a key, and the text you corrected appears nowhere
   in it.

Report any failed step with its letter and number.
