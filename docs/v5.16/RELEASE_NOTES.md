# Correctly 5.16.0 — Release notes

## New: about 40 translation languages

- Translation, Translate & rewrite, Summary, the right-click panel and the
  5.15 translate bubble now offer **39 languages** instead of 6: French,
  English, Arabic, Turkish, German, Spanish, Portuguese, Italian, Dutch,
  Polish, Romanian, Greek, Swedish, Danish, Norwegian, Finnish, Czech,
  Hungarian, Ukrainian, Russian, Bulgarian, Serbian, Croatian, Hebrew,
  Persian, Kurdish, Swahili, Amharic, Hindi, Urdu, Bengali, Indonesian,
  Malay, Vietnamese, Thai, Filipino, Chinese, Japanese and Korean. A curated
  list that Gemini and OpenAI handle well — not "every language".
- **Variants** where they matter: Arabic (Modern Standard, Syrian, and new:
  Egyptian, Moroccan Darija, Lebanese, Gulf), Portuguese (Brazil, Portugal),
  Chinese (Simplified, Traditional), Kurdish (Kurmanji in Latin script,
  Sorani in Arabic script). The variant menu shows only the variants of the
  chosen language, and each language remembers its own variant.
- **Your languages**: every language menu shows your favorites first, then
  all languages in alphabetical order of the interface language, each as
  "Name — native name" (e.g. "Japonais — 日本語"). Choose up to 12 favorites
  in **Settings → Actions → Translation** (default: the six languages of
  earlier versions).
- **Right-to-left** results for Arabic, Hebrew, Persian, Urdu and Sorani
  Kurdish.
- Still **one AI request** per click. Correctly's own interface stays
  English or French.

## Compatibility

- Your saved 5.15 translation defaults (including the Arabic variant) are
  kept.
- **Sync between computers:** update every computer to 5.16. A computer
  still on 5.15 that receives a language it does not know (e.g. Japanese)
  falls back to its default (English), and a new Arabic variant (e.g.
  Egyptian) to Modern Standard Arabic; nothing breaks.

## Test status

See [TEST_REPORT.md](TEST_REPORT.md). The owner's manual checklist
([MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md)) is not done yet, and
real translations into the new languages need the owner's key (BLOCKED).
