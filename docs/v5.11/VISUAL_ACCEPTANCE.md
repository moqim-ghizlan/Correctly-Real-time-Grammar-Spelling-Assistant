# Correctly V5.11 — Visual acceptance

Screenshots taken by `scripts/verify-browser.mjs` with synthetic text
(no real writing, no key):

- `evidence/handle-chrome.png` — the logo half-disk flush with the right
  edge, after a 100 px upward drag; the page selection is still highlighted.
- `evidence/modal-chrome.png` — the centred modal on Correction: logo and
  title, gear and chevron (Hide) only, three tabs, shared text, Generate,
  footer Apply / Copy / Cancel (Apply and Copy disabled before a result).

## Automated layout checks (browser step C02, Chrome and Brave)

- Handle: right edge ±1 px; centre at 50 % ±1 px; taller than wide.
- Modal: centre of the viewport ±1 px; identical layout width and height on
  the three tabs (measured without the opening animation's transform).

## Owner checklist (not yet done)

| Check                                                      | Status                          |
| ---------------------------------------------------------- | ------------------------------- |
| Hover grows the handle slightly, smoothly                  | NOT TESTED                      |
| Dark, light and system themes readable                     | NOT TESTED                      |
| Long result: scrollbar inside the modal, header/tabs fixed | NOT TESTED                      |
| 320 px wide and short windows: modal fits, content scrolls | NOT TESTED                      |
| 200 % zoom                                                 | NOT TESTED                      |
| Arabic result reads right-to-left                          | NOT TESTED (unit: `dir="auto"`) |
| Reduced motion: no opening animation                       | NOT TESTED                      |
| Windows high contrast (forced colors): borders visible     | NOT TESTED                      |
| Page with its own fixed header: handle and modal on top    | NOT TESTED                      |

Proposed sizes (DECISIONS D3) can be adjusted after this review without
changing behaviour.
