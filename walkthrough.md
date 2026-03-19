# Walkthrough

Date: 2026-02-05

## Scope
Full-repo review follow-up with systematic debugging + TDD fixes.

## Changes Made
- Prevented duplicate `MutationObserver` instances by disconnecting before re-init.
- Gated verbose logging behind `DEBUG` via a `log` wrapper; debug helpers exposed only when `DEBUG` is true.
- Sanitized CSV export to avoid spreadsheet formula injection.
- Renamed `_jumpToGPTListenerAdded` to `_jumpToChatListenerAdded`.
- Consolidated URL watchers (removed top-level interval, added cache invalidation to the SPA watcher).
- Keyboard shortcuts now ignore `contenteditable` targets.
- Resolved duplicate `applyTheme` declarations by renaming the page-sync function to `syncThemeWithPage`.

## Tests Added
- `tests/core/observer.test.js`
- `tests/core/logging.test.js`
- `tests/core/csv-sanitize.test.js`
- `tests/core/naming-consistency.test.js`
- `tests/core/url-watcher.test.js`
- `tests/core/keyboard-contenteditable.test.js`
- `tests/core/theme-apply-dup.test.js`

## Tests Run
- `npx jest --coverage=false tests/core/observer.test.js`
- `npx jest --coverage=false tests/core/logging.test.js`
- `npx jest --coverage=false tests/core/csv-sanitize.test.js`
- `npx jest --coverage=false tests/core/naming-consistency.test.js`
- `npx jest --coverage=false tests/core/url-watcher.test.js`
- `npx jest --coverage=false tests/core/keyboard-contenteditable.test.js`
- `npx jest --coverage=false tests/core/theme-apply-dup.test.js`

## Manual Verification Checklist
1. Open ChatGPT and toggle the sidebar, switch chats multiple times; confirm no duplicate updates or lag.
2. With `DEBUG = false`, confirm console is quiet and `window.debugChronoChat` is `undefined`.
3. Export CSV after a message starting with `=SUM(1,2)`; confirm it is treated as text in Excel/Sheets.
4. Verify the sidebar toggle still works (listener flag rename).
5. With sidebar open, type in the chat input; ensure `j/k/` are not intercepted.
6. Switch chats and confirm theme still follows page theme (page-sync function).

## Notes
- Full `npm test` with coverage was previously failing due to duplicate `applyTheme` declarations; this has been resolved by the rename.

## UI/UX Redesign (Phase 5)

### Design Direction
OpenAI‑adjacent Calm Technical Minimalism with a slim vertical signal rail as the differentiation anchor.

### CSS Updates
- Added Google Fonts import for `Sora` and `Source Sans 3`.
- Introduced CSS variables for dark/light palettes.
- Added a glowing vertical rail (`::before`) on the sidebar that intensifies when open.
- Refined toggle button into a minimal pill control.
- Updated header, filters, search, list items, and scrollbars for a calmer, more technical look.

### JS Updates
- Sidebar now toggles an `open` class for rail animation state.
- On init, `open` class is removed when sidebar is forced hidden.

### Manual Checks
1. Toggle sidebar: rail glow appears on open.
2. Light theme: colors switch cleanly for sidebar and toggle button.
3. Verify no layout regressions in filters/search/list.

## UI/UX Remake (Phase 6 - ui-ux-pro-max)

### Skill-Based Direction
- Skill used: `ui-ux-pro-max`
- Selected direction: ChatGPT-like neutral surfaces, green accent states, cleaner hierarchy, higher touch-target consistency.

### Implementation (Executor Task 1)
- Added a new final override section in `style.css` for a full visual pass:
  - Neutral multi-surface token system for dark/light themes.
  - Refined floating toggle button (44x44 circular control).
  - Reworked header/action controls with unified button chrome.
  - Segmented filter style and denser search control layout.
  - Cleaner message rows with consistent spacing, borders, and selection states.
  - Improved dropdown styling and pinned list visual separation.
  - Focus-visible ring updates across interactive controls.
  - Added `prefers-reduced-motion` fallback for reduced animation.
- Removed emoji labels from export menu options in `content_script.js`:
  - `JSON`, `CSV`, `MARKDOWN`.

### Tests Run After Phase 6 Changes
- `npm test -- --runInBand` (16/16 suites, 110/110 tests passing)

### Manual Checks for This Phase
1. Open/close sidebar repeatedly and verify the new visual hierarchy (header, filters, list rows) remains stable.
2. Test dark and light themes and verify accent/focus colors remain readable.
3. Keyboard tab through controls and confirm visible focus ring on all actionable elements.
4. Confirm export dropdown labels show plain text (`JSON`, `CSV`, `MARKDOWN`).

## Systematic Debugging - User/AI Filter Bug

### Symptom
- Filter buttons (`Utente` / `AI`) did not correctly isolate message roles in some sessions.

### Root Cause
1. In `init()`, when existing extension elements were found, code returned early without re-attaching the filter click listener.
2. Legacy sidebar markup could still use `data-filter=\"ai\"`, while filtering logic accepted only `assistant`.

### Fix
- Added `normalizeFilterValue()` and `ensureFilterButtonsHandler()` in `content_script.js`.
- Ensure filter listener is attached both on fresh sidebar creation and on reused existing sidebar path.
- Normalize legacy filter tokens (`ai`, `bot`) to `assistant`.
- `filterMessages()` now uses normalized active filter value.

### Tests Added
- `tests/core/filter-reuse-init.test.js`
  - `clicking user filter hides assistant messages when UI is reused`
  - `legacy ai filter token still maps to assistant behavior`

### Verification
- `npx jest --coverage=false tests/core/filter-reuse-init.test.js --runInBand` (pass)
- `npm test -- --runInBand` (pass, 17 suites / 112 tests)

## Systematic Debugging - User/AI Filter Bug (Follow-up)

### Symptom
- In some ChatGPT DOM variants, selecting `Utente` or `AI` returned empty/incorrect lists.

### Root Cause
- Role extraction in `createMessageListItem` relied on `data-message-author-role`.
- When role metadata was absent on selected nodes, all rows became `unknown`, so role filters failed.

### Fix
- Added `resolveMessageRole()` in `content_script.js` with layered inference:
  1. direct/nested `data-message-author-role`
  2. role hints from `data-testid`, `aria-label`, class name (`user`, `assistant`, `ai`, etc.)
  3. deterministic fallback by index parity (with warning log)
- Updated `createMessageListItem()` to use the new role resolver.

### Tests Added
- `tests/core/filter-role-inference.test.js`
  - Validates role inference from `data-testid/class` hints and correct filtering behavior.

### Verification
- `npx jest --coverage=false tests/core/filter-role-inference.test.js tests/core/filter-reuse-init.test.js --runInBand` (pass)
- `npm test -- --runInBand` (pass, 18 suites / 113 tests)

## Bugfix (2026-02-05): Toggle visibile sopra sidebar aperta

### Problema
- Il pulsante flottante `#chatgpt-nav-toggle` restava visibile anche quando la sidebar era aperta, sovrapponendosi al pannello.

### Fix applicata
- In `style.css`, regola `#chatgpt-nav-toggle.active` aggiornata con:
  - `opacity: 0 !important;`
  - `visibility: hidden !important;`
  - `pointer-events: none !important;`
- Il toggle viene già marcato `active` da `updateToggleButtonState()` quando la sidebar è aperta, quindi il comportamento ora è automatico.

### Verifiche
- `npx jest --coverage=false tests/core/sidebar.test.js --runInBand` ✅
- `npx jest --coverage=false --runInBand` ⚠️ 1 suite fallita non correlata (`tests/core/filter-reuse-init.test.js`, 2 assertion su filtri), 16 suite passate.
