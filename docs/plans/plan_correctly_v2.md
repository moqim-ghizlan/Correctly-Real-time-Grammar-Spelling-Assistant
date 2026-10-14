# Correctly V2 — Universal Editable Detection Plan

## 1. Goal

The goal of Correctly V2 is to stop relying on website-specific selectors.

Correctly should not need custom code such as:

- Gmail selector
- WhatsApp selector
- ChatGPT selector
- LinkedIn selector
- Reddit selector

Instead, the extension should detect editable fields dynamically and work on as many websites as possible using browser events and generic DOM rules.

The target architecture is:

```text
User focuses or types somewhere
        ↓
Global Event Detector
        ↓
Universal Editable Detector
        ↓
Editable Adapter
        ↓
Text Extraction
        ↓
Correctly / LanguageTool
        ↓
Underline + Suggestions Popup
```

---

## 2. Main V2 Principle

Do not search the whole page for known text inputs.

Instead, observe where the user is currently interacting.

Correctly should listen globally for:

- `focusin`
- `beforeinput`
- `input`
- `compositionstart`
- `compositionend`
- `selectionchange`

When one of these events occurs, Correctly determines whether the event comes from an editable text field.

This makes the extension website-independent.

---

## 3. Universal Editable Detector

Create one central function responsible for detecting the real editor.

Suggested API:

```js
findEditableElement(eventOrNode)
```

It should return either:

```js
HTMLElement
```

or:

```js
null
```

Correctly must support at minimum:

### Native text fields

```html
<textarea></textarea>
```

and text-capable inputs:

```html
<input type="text">
<input type="search">
<input type="email">
<input type="url">
<input type="tel">
<input type="password">
```

Password fields should normally be ignored for privacy.

### Contenteditable

Support:

```html
<div contenteditable="true">
```

```html
<div contenteditable="plaintext-only">
```

Also support nested structures such as:

```html
<div contenteditable="true">
  <p>
    <span>User text</span>
  </p>
</div>
```

The event target may be the inner `span`.

Correctly must walk upward until it finds the real editable root.

---

## 4. Prefer Events Over Page Scanning

Avoid code that repeatedly does things like:

```js
document.querySelectorAll(...)
```

to find every possible editor on the page.

The V2 approach should be event-driven.

Example:

```js
document.addEventListener("focusin", handleInteraction, true);
document.addEventListener("beforeinput", handleInteraction, true);
document.addEventListener("input", handleInteraction, true);
```

Use capture mode when useful so Correctly receives events even when websites stop propagation later.

---

## 5. Use `composedPath()`

Modern websites may use Shadow DOM.

Do not rely only on:

```js
event.target
```

Use:

```js
event.composedPath()
```

when available.

Example logic:

```js
const path = event.composedPath?.() || [event.target];
```

Then inspect nodes in the path to locate an editable element.

This improves compatibility with web components and Shadow DOM.

---

## 6. Detect the Real Editable Root

A child element inside a rich text editor may receive the event.

Example:

```html
<div contenteditable="true">
  <p>
    <span>Hello world</span>
  </p>
</div>
```

Correctly should normalize this to the main editable root:

```html
<div contenteditable="true">
```

Suggested helper:

```js
getEditableRoot(node)
```

Possible logic:

1. Check the current node.
2. If it is a supported `input` or `textarea`, return it.
3. If it is contenteditable, find the correct contenteditable root.
4. Otherwise walk through parents.
5. Stop when leaving the relevant DOM tree.
6. Return `null` if nothing editable is found.

---

## 7. Editable Adapters

Different editor types expose text differently.

Create a common adapter interface instead of mixing all logic together.

Example:

```js
{
  getText(),
  replaceRange(start, end, replacement),
  getSelection(),
  getRectForRange(start, end)
}
```

Implement at least two adapters.

### Input / Textarea Adapter

Handles:

```text
input
textarea
```

Text comes from:

```js
element.value
```

Selection comes from:

```js
selectionStart
selectionEnd
```

### ContentEditable Adapter

Handles:

```text
contenteditable
```

Text comes from the DOM.

Selections use:

```js
window.getSelection()
Range
```

The adapter should hide these differences from the rest of Correctly.

---

## 8. Separate Detection From Correction

Do not mix editor detection with LanguageTool logic.

Recommended modules:

```text
editor-detector
editor-adapters
text-observer
correction-engine
overlay-renderer
suggestion-popup
language-detector
```

The correction engine should only receive normalized data like:

```js
{
  text,
  editor,
  selection,
  language
}
```

It should not care whether the text came from Gmail, WhatsApp, ChatGPT, etc.

---

## 9. Track the Active Editor

Correctly should maintain something similar to:

```js
let activeEditor = null;
```

Update it when:

- focus changes
- typing starts
- the user clicks into another editor

If the editor disappears from the DOM:

```js
!activeEditor.isConnected
```

Correctly should release it and clean its overlays.

---

## 10. MutationObserver

Use a `MutationObserver` only as a helper.

Do not make it the primary editor detection system.

It can be useful for:

- detecting editor removal
- cleaning obsolete overlays
- detecting DOM replacement in SPAs
- reacting when a website rebuilds the active editor

Avoid continuously scanning every newly created DOM node for editable fields.

---

## 11. SPA Compatibility

Correctly must work when websites change pages without reloading.

Examples:

- Gmail
- WhatsApp Web
- ChatGPT
- LinkedIn

The event-based approach naturally helps because listeners remain active at the document level.

Do not depend on page-load-only editor discovery.

---

## 12. iframe Support

Configure the content script to run in frames where permitted.

Example Manifest V3 direction:

```json
{
  "all_frames": true
}
```

Each frame should run its own editable detection logic.

Do not assume the top-level document owns every editor.

Cross-origin browser security restrictions must still be respected.

---

## 13. Shadow DOM Support

Support open Shadow DOM through:

```js
event.composedPath()
```

Do not attempt unsafe hacks around closed Shadow DOM.

If an editor is implemented inside a closed shadow root and the browser does not expose enough information, Correctly may not support it.

That should be treated as a technical limitation rather than requiring a site-specific hack.

---

## 14. Ignore Non-Text / Unsafe Fields

Correctly should ignore fields such as:

```text
button
checkbox
radio
file
range
color
date
time
number (optional)
```

It should also ignore:

```html
<input type="password">
```

unless password support is explicitly enabled later.

Also ignore:

- readonly fields
- disabled fields
- invisible elements
- Correctly's own UI

---

## 15. Prevent Correctly From Detecting Its Own UI

Every Correctly UI host should keep the existing marker:

```html
data-correctly-ui
```

The detector must reject any element whose ancestor belongs to Correctly UI.

Example helper:

```js
isInsideCorrectlyUI(node)
```

This prevents popup buttons and extension controls from being treated as user editors.

---

## 16. Debounced Correction Requests

Do not call LanguageTool after every keystroke immediately.

Suggested flow:

```text
input event
    ↓
cancel previous pending timer
    ↓
wait ~300–500 ms
    ↓
read latest text
    ↓
send correction request
```

Also cancel stale requests when a newer text version exists.

Use a request/version identifier, for example:

```js
analysisVersion++
```

Only apply results matching the latest version.

---

## 17. IME / Composition Safety

Correctly should not run grammar analysis in the middle of text composition.

Listen for:

```js
compositionstart
compositionend
```

During composition:

```js
isComposing = true
```

Pause correction.

After `compositionend`, schedule a new analysis.

This is important for languages and virtual keyboards.

---

## 18. Text Extraction Strategy

For normal inputs, analyze:

```js
element.value
```

For rich editors, build a normalized plain-text representation.

Maintain a mapping between:

```text
plain text offsets
↔
DOM positions
```

This mapping is needed to place underlines and apply corrections correctly.

Avoid assuming that:

```js
textContent offset === DOM Range offset
```

for complex rich text.

---

## 19. Large Text Optimization

Do not always send an entire large document to LanguageTool.

For small editors:

```text
analyze full content
```

For larger editors:

```text
analyze current paragraph
or
current sentence + nearby context
```

Possible threshold:

```text
~5,000 characters
```

The exact threshold can be tuned later.

---

## 20. Rendering Underlines

Rendering should remain independent from the website.

The overlay layer should:

1. get correction offsets
2. convert offsets to screen rectangles
3. draw underline overlays
4. update on:
   - scroll
   - resize
   - text change
   - editor movement

Do not modify the website's text DOM solely to create underlines.

Prefer overlay-based rendering where possible.

---

## 21. Scroll Containers

The renderer must not assume that only `window` scrolls.

The active editor may be inside nested scroll containers.

Correctly should detect relevant ancestors with:

```text
overflow: auto
overflow: scroll
overflow: hidden
```

and refresh overlay positions when these containers scroll.

---

## 22. Suggestion Replacement

When the user clicks a suggestion:

1. verify that the correction is still valid
2. replace the correct text range
3. preserve cursor/selection
4. trigger the events expected by the website
5. close the popup
6. request a fresh correction pass

Do not directly mutate rich-editor DOM without considering the site's editor state.

---

## 23. Framework-Friendly Input Changes

Some sites use React, Vue, Angular, ProseMirror, Lexical, Slate, etc.

Replacing visible DOM text may not update the framework's internal state.

For native inputs, use a reliable value update strategy and dispatch appropriate events.

For contenteditable, prefer browser editing APIs / selection-aware insertion where practical.

The universal layer should handle most cases first.

Only introduce editor-specific adapters later if a major editor framework cannot be supported generically.

---

## 24. Fallback Strategy

Correctly V2 should follow this order:

```text
Universal detection
        ↓
Generic native adapter
        ↓
Generic contenteditable adapter
        ↓
Framework adapter if truly necessary
        ↓
Site-specific workaround only as last resort
```

Site-specific selectors should NOT be the default architecture.

They should be exceptional fallbacks.

---

## 25. Compatibility Target

The goal is not to promise 100% support for every text editor on the web.

The target is:

```text
Most normal text inputs: full support
Most contenteditable editors: full support
Modern rich text editors: best generic support
Complex custom editors: fallback/adapter when necessary
Closed Shadow DOM or restricted frames: documented limitation
```

A realistic goal for V2 is to make the large majority of websites work without per-site configuration.

---

## 26. Language Handling

Keep V2 language handling independent from editor detection.

For the current Correctly scope, Auto mode should preferably support only:

```text
French
English
```

Do not accept unrelated LanguageTool detections such as Irish when the extension is configured for FR/EN only.

Suggested fallback:

```text
if detected language is fr/en:
    use it
else:
    keep last reliable fr/en language
```

Short ambiguous texts should not cause random language switching.

---

## 27. Proposed File Structure

Example:

```text
src/
├── content/
│   ├── editor-detector.js
│   ├── active-editor.js
│   ├── text-observer.js
│   └── content-script.js
│
├── editors/
│   ├── base-adapter.js
│   ├── input-adapter.js
│   └── contenteditable-adapter.js
│
├── corrections/
│   ├── correction-engine.js
│   ├── language-detector.js
│   └── request-manager.js
│
├── ui/
│   ├── overlay-renderer.js
│   └── suggestion-popup.js
│
└── utils/
    ├── dom.js
    ├── ranges.js
    └── debounce.js
```

Adapt the exact structure to the existing project rather than rewriting working code unnecessarily.

---

## 28. Implementation Phases

### Phase 1 — Universal Detection

Implement:

```text
focusin
beforeinput
input
composedPath()
editable root detection
active editor tracking
```

Test on simple HTML pages first.

### Phase 2 — Native Editors

Fully support:

```text
input
textarea
```

Validate:

- detection
- correction
- underline
- suggestion replacement
- cursor preservation

### Phase 3 — Generic ContentEditable

Support:

```text
contenteditable=true
contenteditable=plaintext-only
nested elements
```

Build reliable text-to-DOM offset mapping.

### Phase 4 — Dynamic Websites

Test without custom selectors on:

```text
ChatGPT
Gmail
WhatsApp Web
LinkedIn
Reddit
Google Docs-like editors where technically possible
```

Do not add site-specific code immediately when something fails.

First identify the generic reason.

### Phase 5 — Frames + Shadow DOM

Enable frame support and validate `composedPath()` behavior.

### Phase 6 — Cleanup

Remove obsolete site-specific selectors where the universal system replaces them safely.

Keep a minimal fallback registry only for genuinely unavoidable cases.

---

## 29. Testing Checklist

For every editor tested:

- [ ] Focus is detected
- [ ] Typing is detected
- [ ] Correct editable root is found
- [ ] Correct text is extracted
- [ ] No duplicate Correctly instance appears
- [ ] LanguageTool receives the latest text
- [ ] Old requests cannot overwrite new results
- [ ] Underlines appear at the correct positions
- [ ] Underlines follow scrolling
- [ ] Popup opens on the correct error
- [ ] Suggestion replacement changes the intended text
- [ ] Cursor stays in a reasonable position
- [ ] Popup closes after replacement
- [ ] Re-analysis happens after replacement
- [ ] Correctly UI is never analyzed as user text
- [ ] Switching between two editors works
- [ ] Removing/replacing an editor does not leave stale overlays
- [ ] SPA navigation does not break Correctly
- [ ] IME composition does not trigger broken partial corrections

---

## 30. Regression Tests

Do not break currently working V1 behavior.

Keep tests for:

```text
French grammar detection
English grammar detection
manual FR selection
manual EN selection
Auto FR/EN
ignore error
apply suggestion
popup positioning
overlay cleanup
```

Add automated unit tests for:

```text
isEditableElement()
getEditableRoot()
composedPath handling
input type filtering
active editor switching
request versioning
```

---

## 31. Important Rule for the Agent

When a website fails, do NOT immediately add:

```js
if (hostname.includes(...))
```

and do NOT immediately add a site-specific selector.

First answer:

```text
Why did the universal detector fail?
```

Possible generic causes:

- event target normalization
- nested contenteditable
- Shadow DOM
- iframe
- editor recreated by SPA
- text offset mapping
- framework-controlled state
- scrolling container
- unsupported custom editor

Fix the generic layer whenever possible.

Only create a website-specific fallback if there is no robust generic solution.

---

## 32. Definition of Done for V2

V2 is considered successful when:

1. Correctly no longer depends primarily on per-site selectors.
2. Native inputs and textareas work generically.
3. Standard and nested contenteditable fields work generically.
4. The active editor is detected from user interaction.
5. Dynamic SPA pages are supported without page-specific initialization.
6. FR/EN auto detection does not randomly switch to unrelated languages.
7. Underlines and suggestions stay synchronized with the active editor.
8. Existing V1 functionality remains stable.
9. Site-specific workarounds are reduced to exceptional fallback cases.

---

# Final Architectural Principle

Correctly should think in terms of:

```text
"This is an editable text surface."
```

not:

```text
"This is Gmail."
"This is WhatsApp."
"This is ChatGPT."
```

The website should be mostly irrelevant to the correction engine.

The browser interaction and editor capabilities should determine how Correctly behaves.
