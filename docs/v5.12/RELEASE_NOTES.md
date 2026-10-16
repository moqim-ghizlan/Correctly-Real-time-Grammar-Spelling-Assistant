# Correctly 5.12.0 — Release notes

## New

- **Summary tab** (fourth tab of the modal): summarize the text directly in
  French, English, Arabic (Modern Standard or Syrian colloquial), Turkish,
  German or Spanish — in **one** AI request, whatever the source language.
  Length: Short / Medium / Detailed. Format: Paragraph / Key points.
- **Read any page text**: text selected on a regular web page (article,
  documentation) now fills the modal. Results can be copied; Correctly never
  edits the page (Apply stays disabled).
- The Translate shortcut also accepts page text (copy only).
- Summaries accept up to 12,000 characters (other actions: 2,000). Longer
  text is refused, never cut.
- **Summary** has its own route (Settings → AI providers; uses the default
  until set), its own daily/weekly/monthly limits (off by default, always
  counted in the total) and its own statistics category.

## Settings page redesign (owner request)

- The settings page is now in **French** and split into seven pages with a
  sidebar: Démarrage, Fournisseurs IA, Actions, Raccourcis texte, Limites
  d’usage, Statistiques, À propos (one page shown at a time; links such as
  `#usage-limits` still open the right page). On narrow windows the menu
  moves to the top.
- New visual style (cards, light/dark themes, numbered first steps);
  per-action and per-provider limits are folded by default (opened
  automatically when one is on). All settings, IDs and behaviour are
  unchanged. The in-page modal stays in English.

## Unchanged

Right-edge handle, Ctrl+M and toolbar icon; the modal opens on Correction;
Settings and Hide only; Apply/Undo (5 s) on plain text boxes only; no new
permission, host or dependency; no automatic retry or fallback.

## Upgrade notes

Keys, routes, limits, counters, history and shortcuts are kept. Rolling back
to 5.11 after saving limits in 5.12 requires restoring the safe limits in
5.11 (see `IMPLEMENTATION.md`, Migration).
