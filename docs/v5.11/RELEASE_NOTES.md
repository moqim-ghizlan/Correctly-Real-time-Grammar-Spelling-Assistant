# Correctly 5.11.0 — Release notes

## New

- **One Correctly window.** The toolbar icon, **Ctrl+M** and the new
  right-edge handle open the same centred window with three tabs:
  **Correction**, **Reformulation** and **Translation**.
- **Shared text.** Your selection is copied into one editable text field
  used by every tab (or the field starts empty: type or paste).
- **Explicit Generate per tab.** Nothing is sent before you click
  Generate. Each tab keeps its result while the text is unchanged; editing
  the text clears all three.
- **Apply hides the window** and offers **Undo for five seconds**. Copy
  keeps it open. Without a plain text box selection, Apply is disabled and
  Copy works.
- **Right-edge handle.** A small logo half-disk on the right edge of every
  page (opt-in, same setting and site access as the former smart button).
  Click to open; drag up or down to move it — the position is remembered.
- Header: **Settings** (gear) and **Hide** only; Escape also hides.

## Changed

- The toolbar icon now opens the window instead of correcting directly.
  Direct correction remains on **Alt+Shift+C** and the right-click menu.
- The three small smart buttons (✓ ✎ ⇄) next to text fields are replaced by
  the handle.

## Unchanged

Providers, keys, routes, usage limits, statistics, text shortcuts, consent,
privacy rules, permissions.

## Known limitations

- Ctrl+M is a suggested shortcut: if another extension or app uses it,
  assign it in `chrome://extensions/shortcuts`.
- Browser pages (`chrome://`, `brave://`, Web Store, PDF viewer) cannot show
  the window; the settings open instead.
- Text selected inside an embedded frame is not prefilled.
