# Correctly 5.16.0 — Manual test checklist

Load `dist/` (or the 5.16 zip), click **Reload** on the extension card,
reload the test tabs. A real Gemini or OpenAI key is needed for the
translations. Note PASS / FAIL / NOT TESTED / BLOCKED.

| #   | Scenario                                                                    | Expected                                                                                  | Result     |
| --- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------- |
| 1   | Window (Ctrl+M) → Translation: open the "To" menu                           | "Your languages" first (French, English, Arabic, Turkish, German, Spanish), then all A→Z  | NOT TESTED |
| 2   | Translate a French sentence → Japanese                                      | one request (Statistics +1), Japanese result, label "Japonais" / "Japanese"               | NOT TESTED |
| 3   | → Persian, then Hebrew, then Urdu                                           | each result right-to-left, one request each                                               | NOT TESTED |
| 4   | → Portuguese: the variant menu                                              | only Brazil / Portugal; Brazil gives Brazilian Portuguese                                 | NOT TESTED |
| 5   | → Chinese, variant Traditional                                              | Traditional characters (e.g. 這, 們), not Simplified                                      | NOT TESTED |
| 6   | → Arabic, variant Egyptian; then Syrian                                     | Egyptian colloquial; Syrian unchanged from 5.15; right-to-left                            | NOT TESTED |
| 7   | → Kurdish, Sorani then Kurmanji                                             | Sorani in Arabic script, right-to-left; Kurmanji in Latin script, left-to-right           | NOT TESTED |
| 8   | Summary tab → Korean                                                        | one request, Korean summary                                                               | NOT TESTED |
| 9   | Translate button bubble (5.15) → Chinese Traditional                        | one request, Traditional Chinese; favorites first in the bubble menu                      | NOT TESTED |
| 10  | Right-click → Translate selected text…                                      | same menus (favorites first, variants per language)                                       | NOT TESTED |
| 11  | Settings → Actions → Translation: tick Japanese, untick Turkish             | saved at once; menus everywhere show the new favorites (reload the tab for the bubble)    | NOT TESTED |
| 12  | Tick a 13th favorite                                                        | error "at most 12", previous choice kept                                                  | NOT TESTED |
| 13  | Default target Portuguese → Portugal, then Arabic → Gulf, then Portuguese   | each language keeps its own variant                                                       | NOT TESTED |
| 14  | Settings page in French and in English                                      | language names, sort order and groups in that language                                    | NOT TESTED |
| 15  | Computer updated from 5.15 with Arabic Syrian saved                         | still Arabic Syrian after the update                                                      | NOT TESTED |
| 16  | Two computers with sync on, one on 5.15, one on 5.16; set target = Japanese | the 5.15 computer falls back to English (its default), keeps its Arabic variant; no crash | NOT TESTED |
| 17  | Brave                                                                       | same as 1–3                                                                               | NOT TESTED |
