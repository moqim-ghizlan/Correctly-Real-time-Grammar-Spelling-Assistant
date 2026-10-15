# Correctly V5.8 — Usage limits (owner guide)

Open the Correctly settings, then go to **Usage limits**. A **Manage limits**
button in the page preview also opens it.

## What counts

- **One AI request = one count.** A rewrite in four styles, or a translation
  with styles, is still one request.
- A confirmed **Test** counts too.
- **Never counted:**
  - **Check key** (model list);
  - text shortcuts (`bjr` → `Bonjour`);
  - Apply, Copy, Cancel and Undo;
  - anything refused before sending (no consent, no key, offline, a limit
    reached).
- **Counted once it may have been sent, even if it then fails** (provider
  error, timeout, cancelled while running). It may be billed, so it is never
  refunded. Correctly never retries by itself.

## Limits

- **Total.** Every request counts here, whatever the action, provider or
  key, by day, week (Monday to Sunday) and month. At least one total limit
  stays on.
- **Correction, Rewrite, Translation, Translate & rewrite.** Their own
  daily, weekly and monthly limits. Translate & rewrite counts once, in its
  own category.
- **Advanced (optional).** Limits per provider (Gemini, OpenAI) and per API
  key. They only add restrictions.

## How limits combine

- A request is sent only if **every** limit that is on allows it.
- Switching to another key, model or provider never frees requests from the
  total or action limits.
- Correctly never switches to another key by itself.
- A limit that is off still counts. If you turn it on later, the usage
  already made in the period counts toward it.
- Type numbers as `5000`, `5,000` or `5 000` (from 1 to 1,000,000). There is
  no zero or "unlimited" value: use **Pause all AI requests** to stop
  everything. Text shortcuts keep working while paused.

## Warnings

- At 80 % and 95 % of a limit, one warning appears in the page preview and in
  the settings. You can turn each warning level off.
- At 100 % the requests covered by that limit are blocked before anything is
  sent. The refusal names the limit and the reset time, with its time zone.
- Each warning appears once per limit and period. **Dismiss** only hides it:
  it never frees a request.

## Time zone

- Days, weeks and months follow the time zone shown in the section. The
  browser's zone is used on first use.
- **Change…** switches it. The current counts carry over, so nothing is
  reset.
- If your computer's clock moves back more than 5 minutes, requests pause
  until you click **My clock is correct**.

## Repairs

- **"Usage temporarily unavailable".** The usage records cannot be read, so
  no request is sent. Reload the page, then restart the browser.
- **"Needs repair".** The saved limits are damaged. **Restore safe limits**
  keeps all recorded usage.
- **"Changed in another tab or window".** Another settings tab saved first.
  Click **Reload saved limits**.

## Honest limits of this protection

- The count is per browser profile. Chrome, Brave, other profiles, devices
  and other apps using the same keys are not counted.
- Clearing the browser's data or uninstalling erases it.
- It counts requests, not money: a long request costs more than a short one.
  Set spend caps at your providers too:
  - Google: <https://ai.google.dev/gemini-api/docs/billing>
  - OpenAI: <https://platform.openai.com/settings/organization/limits>
- After upgrading from V5.7, only that day's count is known. Earlier days of
  the week and month are not, because V5.7 did not keep them. The section says
  so.
