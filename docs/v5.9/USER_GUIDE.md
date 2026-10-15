# Correctly V5.9 — Statistics (owner guide)

Open the Correctly settings, then go to **Statistics** (below **Usage
limits**).

Looking, filtering, refreshing and exporting work offline and never contact
Google or OpenAI. They never change a limit either.

## Period

- **Today**, **This week** (Monday to Sunday) and **This month** follow the
  time zone of your usage limits.
- **Custom range**: start and end dates, both included, up to 366 days.
- A request belongs to the day it was **sent**, even if the answer came after
  midnight. An Apply belongs to the day you clicked it.

## The five cards

- **Requests used.** Requests sent or possibly sent, the same count as the
  usage limits. A rewrite in four styles is one request.
  - Failures and timeouts count: they may be billed.
  - "In progress" requests are still waiting for an answer.
- **Successful AI results.** Valid answers, including "no errors found". This
  does not mean you applied them.
- **AI edits applied.** Edits Correctly actually wrote into your text after
  **Apply**.
  - Copy, Cancel and a refused Apply (the text changed meanwhile) do not
    count.
  - **Undos recorded by Correctly** are its own Undo button only; Ctrl+Z
    cannot be seen.
  - Recorded since V5.9.
- **Tokens reported.** The token counts each provider returned, and for how
  many requests. A timeout has no counts: it shows as unknown, never as 0.
- **Estimated API cost (USD).** Reported tokens × the price in force when the
  request was sent.
  - **Partial**: some requests cannot be priced (no token counts, or no price
    for that model).
  - **Unavailable**: none can be priced.
  - **$0.00** appears only when no request was sent.

## Breakdowns and filters

- Filter by action, provider, model or API key.
- The tables split requests by action, by provider and model, and by API key.
  Each table adds up to the same total.
- A deleted key keeps its history, shown as `Deleted key (…1234)`.
- **Requests per day** has a bar chart; the same numbers are in **Requests per
  day as a table**.

## Price references

- The built-in prices are the official list prices checked on
  **15 October 2026**:

  | Model                 | Input $ / 1M | Cached input | Output |
  | --------------------- | ------------ | ------------ | ------ |
  | gemini-3.1-flash-lite | 0.25         | 0.025        | 1.50   |
  | gemini-3.5-flash-lite | 0.30         | 0.03         | 2.50   |
  | gpt-5.6-luna          | 0.20         | 0.02         | 1.20   |
  | gpt-6-luna            | 0.10         | 0.01         | 0.50   |
  | gpt-5-nano            | 0.05         | 0.005        | 0.40   |

  OpenAI prices are the short-context ones (≤ 272K tokens). Correctly's
  requests are far smaller than that.

- If a price changes, add a reference with the date it applies from. Older
  requests keep their older price. A reference can only be added, never
  edited.
- An estimate is not your invoice. Taxes, credits, free tiers and currency
  conversion are not included. Prices are in USD only.

## Export and delete

- **Export CSV / Export JSON** saves the aggregates of the period shown: the
  numbers, token coverage and estimates. It never includes your text, your
  keys or page addresses. Spreadsheet formulas in labels are neutralized.
- **Delete statistics history** removes Correctly's records of requests sent
  before a date, and of the edits applied. It keeps:
  - your keys;
  - your usage limits, and what they already counted (limits stay
    enforced);
  - anything at Google or OpenAI.
- Records are also removed automatically after 400 days.

## What statistics cannot show

- Requests made before the V5.8 upgrade are counted only in the usage limits.
- Other browsers, profiles and apps using the same keys are not counted.
- Clearing the browser's data erases the statistics.
