# ChronoChat

ChronoChat is a Manifest V3 browser extension for ChatGPT that adds a native-feeling conversation map: fast jump navigation, export, keyboard shortcuts, resilient DOM parsing, and a UI designed to stay visually coherent with ChatGPT.

## What It Does

- Opens a right-side conversation map for the current chat
- Filters messages by `All`, `You`, or `AI`
- Supports text search, regex search, and case-sensitive matching
- Exports the current conversation as `JSON`, `CSV`, or `Markdown`
- Supports keyboard navigation:
  - `Ctrl/Cmd + J`: open or close ChronoChat
  - `/`: focus search
  - `j` / `k`: move selection
  - `Enter`: jump to selected message
  - `Esc`: close the sidebar or clear search focus state

## Product Principles

- Native-feeling UI that stays subordinate to ChatGPT
- No remote fonts or third-party network requests
- No analytics, tracking, or backend
- Preferences stored locally through extension storage

## Supported Hosts

- `https://chat.openai.com/*`
- `https://chatgpt.com/*`

## Architecture

Source code lives in `src/`:

- `src/content/`: modular content-script source
- `src/service_worker.js`: background command routing
- `src/style.css`: source stylesheet

Build outputs used by the manifest:

- `content_script.js`
- `service_worker.js`
- `style.css`

The build keeps the runtime vanilla while making the source modular and testable.

## Development

Install dependencies:

```bash
npm install
```

Run tests:

```bash
npm test -- --runInBand
```

Build the extension outputs:

```bash
npm run build
```

Run the full validation gate:

```bash
npm run validate
```

## Loading the Extension

### Chrome / Chromium

1. Open `chrome://extensions/`
2. Enable Developer Mode
3. Choose `Load unpacked`
4. Select this project directory

### Firefox

The project is designed primarily for Chromium MV3. Firefox may work for content-script behavior, but background compatibility should be verified before relying on it for release.

## Privacy

- No message content is sent to external services
- No remote assets are required at runtime
- No tracking or analytics are included
- All persistence is local to the extension environment, with test-only fallback behavior when extension APIs are unavailable

## Notes for Contributors

- Keep UI changes visually aligned with ChatGPT, not brand-heavy
- Prefer selector-first DOM parsing with resilient fallbacks
- Keep conversation-scoped state separate from global preferences
- Add runtime tests for behavior changes instead of source-inspection placeholders

## License

MIT
