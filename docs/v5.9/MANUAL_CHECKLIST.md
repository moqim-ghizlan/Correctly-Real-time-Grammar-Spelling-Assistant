# V5.9 manual checklist (owner)

Before you start:

1. Run `npm run build`.
2. Click **Reload** in `chrome://extensions` (and in Brave).
3. Real AI requests may be billed: keep small limits, e.g. a total daily
   limit of 10.

Never paste a real key into screenshots or bug reports.

## A. Upgrade and first view

1. Open the settings → **Statistics**. Expected:
   - **Today** shows the requests you made since the V5.8 upgrade.
   - A yellow note says when detailed statistics start.
   - **Usage limits**, keys, routes and shortcuts are unchanged.
2. Turn the network off (or go offline), then click **This week**, **This
   month** and **Refresh**. Expected: the page still works.

## B. Correction, Apply, Undo

1. Correct a sentence and click **Apply**. Expected, after **Refresh**:
   - Requests used +1;
   - Successful +1;
   - AI edits applied +1;
   - tokens reported for 1 more request;
   - an estimated cost (for example `$0.00002 (estimate)`).
2. Click **Undo correction**. Expected: "Undos recorded by Correctly: 1". The
   requests are unchanged.
3. Correct again, type a word in the field, then click Apply (it is refused),
   then **Copy**. Expected: AI edits applied does not change.

## C. Rewrite and translation

1. Rewrite with 4 styles, then apply one. Expected:
   - Requests +1 (not 4);
   - Rewrite +1 in **By action**;
   - applied +1.
2. Translate into Arabic (Syrian), then Translate & rewrite. Expected: one
   request each, under their own action.

## D. Breakdowns, prices, export

1. Filter **Provider → OpenAI**, then choose a model and an API key. Expected:
   every card and table follows the filter.
2. Open **Price references**. The official prices are dated 15 October 2026.
   Add a price for one model applying from tomorrow. Expected: today's
   estimate does not change.
3. Click **Export CSV** and **Export JSON** and open the files. Expected:
   numbers only, with no text you wrote and no key.

## E. Deletion keeps limits

1. Set the total daily limit to the number of requests already used today.
2. In **Delete statistics history**, choose tomorrow's date and confirm.
   Expected:
   - Statistics show 0 requests, with a note that history was deleted;
   - **Usage limits** still show the used count;
   - a new correction is refused ("limit reached").

## F. Privacy

1. Nothing in Statistics shows your text or a key.
2. DevTools → Network on the settings page: opening and filtering Statistics
   makes no request.

Report any failed step with its letter and number.
