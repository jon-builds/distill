# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Distill is a Chrome Manifest V3 extension that extracts transcripts from YouTube videos and optionally processes them using OpenAI or Claude AI with custom prompts.

**Current Version:** 4.3.5
**Branch Strategy:** `main` is the stable branch (contains v4.3.5). All PRs should target `main`. Create feature branches from `main`.

## Development Workflow

### Zero-Build Architecture

This extension has **no build process**:
- No `package.json`, no npm dependencies, no bundler
- All JavaScript is vanilla ES6
- Direct file editing workflow
- No transpilation or compilation

### Loading the Extension

1. Navigate to `chrome://extensions/`
2. Enable "Developer mode" (top-right toggle)
3. Click "Load unpacked"
4. Select the repository folder
5. Extension loads immediately

### Reloading During Development

After editing any files:
1. Go to `chrome://extensions/`
2. Click the reload icon on the extension card
3. If you modified `content.js`, also refresh the YouTube page

### Debugging

**Popup (popup.js):**
- Right-click extension icon → "Inspect popup"
- Opens dedicated DevTools instance for popup

**Settings Page (settings.js):**
- Right-click on settings page → "Inspect"
- Check Network tab for API calls
- Check Application → Storage → Chrome Sync for saved settings

**Content Script (content.js):**
- Open YouTube page
- Press F12 to open DevTools
- Check Console tab for content script logs

**Background Service Worker (background.js):**
- Go to `chrome://extensions/`
- Click "service worker" link under the extension
- Opens dedicated DevTools instance for background worker

### Icon Generation (Optional)

If modifying icons:
```bash
python3 create_icons.py
```
Generates icon16.png, icon48.png, icon128.png from RGB data.

## Architecture Overview

### Component Structure

```
manifest.json                    # Extension configuration (permissions, content scripts, background worker)
├── popup.html/css/js            # Extension popup UI (extract button)
├── settings.html/css/js         # Settings page (API keys, prompts, models)
├── background.js                # Service worker (CORS bypass, API calls, streaming ports, chat handlers)
├── CHANGELOG.md                 # Version history (Keep a Changelog format)
├── PRIVACY_POLICY.md            # Privacy policy for Chrome Web Store submission
└── Content Scripts (run on YouTube pages):
    ├── constants.js             # Shared constants (timing, selectors, limits) — loaded first
    ├── utils.js                 # Shared utility functions (logging, HTML escaping, markdown)
    ├── theme-detector.js        # Detects YouTube light/dark theme
    ├── cache-manager.js         # Local cache with LRU eviction (10 videos)
    ├── chat-manager.js          # Manages per-video chat conversation state
    ├── modal-ui.js              # Modal creation, display, interactions, chat UI, streaming display
    ├── modal-styles.css         # Modal styling with theme support, chat styles, minimize styles
    ├── transcript-orchestrator.js  # Unified extraction/caching/streaming/chat flow
    ├── content.js               # YouTube transcript extraction with MutationObserver
    └── content-injector.js      # Floating purple FAB entry point
```

### Message Passing Architecture

The extension uses three message channels:

**Channel 1: Popup ↔ Content Script**
```javascript
// popup.js sends to content.js
chrome.tabs.sendMessage(tabId, { action: 'getTranscript' });

// content.js responds
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscript().then(result => sendResponse(result));
    return true; // CRITICAL: Keep channel open for async response
  }
});
```

Response format: `{ success: true, transcript: "...", videoId: "..." }`

**Channel 2: Popup/Settings ↔ Background Worker**
```javascript
// api.js or settings.js sends to background.js
chrome.runtime.sendMessage({
  action: 'callOpenAI',  // or 'callClaude', 'fetchOpenAIModels', 'fetchClaudeModels'
  apiKey, model, prompt, transcript
});

// background.js responds
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'callOpenAI') {
    callOpenAI(...).then(result => sendResponse({ success: true, result }));
    return true; // CRITICAL: Keep channel open for async response
  }
});
```

**Channel 3: Background Worker ↔ External APIs**
```javascript
// background.js makes direct fetch() calls
fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` }
});
```

**Channel 4: Streaming via Ports (Content Script ↔ Background Worker)**
```javascript
// transcript-orchestrator.js connects to background.js for streaming
const port = chrome.runtime.connect({ name: 'streamOpenAI' }); // or 'streamClaude'
port.postMessage({ apiKey, model, prompt, transcript });
port.onMessage.addListener((msg) => {
  if (msg.type === 'chunk') { /* progressive text */ }
  if (msg.type === 'done') { /* stream complete */ }
  if (msg.type === 'error') { /* handle error */ }
});
```

**Channel 5: Chat Messages (Content Script ↔ Background Worker)**
```javascript
// Multi-turn chat via one-shot messages
chrome.runtime.sendMessage({
  action: 'chatOpenAI',  // or 'chatClaude'
  apiKey, model, messages: [{role, content}, ...], system
});
```

**Why background.js exists:** Content scripts and popup/settings pages cannot make cross-origin API requests due to CORS. The background service worker bypasses this restriction.

### Critical Pattern: Async Message Responses

ALL message listeners that respond asynchronously **must** return `true`:

```javascript
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  asyncFunction()
    .then(result => sendResponse(result))
    .catch(error => sendResponse({ error }));
  return true; // Without this, Chrome closes the channel before async response
});
```

## Key Components

### background.js (Service Worker)

Acts as a CORS bypass proxy for API calls. Implements:

- `formatModelLabel(modelId)` - Converts raw model IDs to user-friendly labels (e.g., "gpt-4o" → "GPT-4o")
- `fetchOpenAIModels(apiKey)` - Fetches models from OpenAI `/v1/models` endpoint
  - Filters by excluding non-chat models (embedding, whisper, tts, dall-e, legacy models)
  - Includes all GPT, O1, and ChatGPT variants
  - Returns models with friendly labels and priority sorting
  - Logs discovered models to console for debugging
- `fetchClaudeModels(apiKey)` - Fetches models dynamically from `/v1/models` endpoint, falls back to hardcoded list
- `callOpenAI(apiKey, model, prompt, transcript)` - Calls OpenAI chat completions with dynamic parameters
  - Uses `max_completion_tokens` for O1/GPT-4o models, `max_tokens` for legacy models
  - Includes `temperature: 0.7` for non-O1 models, excludes it for O1 models
  - Backward compatible with GPT-3.5/GPT-4, forward compatible with O1/GPT-4o
- `callClaude(apiKey, model, prompt, transcript)` - Calls Claude messages API (max_tokens 4096)
- `chatOpenAI(apiKey, model, messages)` - Multi-turn chat via OpenAI (v4.0)
- `chatClaude(apiKey, model, messages, system)` - Multi-turn chat via Claude with top-level system param (v4.0)
- `fetchWithRetry(url, options, maxRetries, retryDelays)` - Retry wrapper for transient errors (429, 500, 502, 503)
- `_buildOpenAIHeaders(apiKey)` / `_buildClaudeHeaders(apiKey)` - Shared header builders
- `_buildOpenAIRequestBody(model, messages, options)` - Model-specific request body builder (GPT-5-nano: 16384 tokens for reasoning headroom, others: 4000)
- Port handlers: `streamOpenAI` / `streamClaude` - SSE streaming via `chrome.runtime.connect()` ports

All functions use `fetch()` with proper authentication headers. Streaming uses `response.body.getReader()` for SSE parsing.

### content.js (YouTube Transcript Extraction)

Extracts transcripts from YouTube's DOM:

1. Checks if transcript panel is open
2. If not, opens the panel via `tryDescriptionExpanderPath()` (primary, as of v4.3.5): expands the description (`#expand`) → clicks the inline `button[aria-label="Show transcript"]`. Falls back to `tryMenuPath()` (legacy "More actions" menu) if the new path fails. Tracks `weOpenedPanel` flag. See `docs/youtube-dom-layout.md` for the current YouTube DOM layout reference.
3. Uses MutationObserver (`waitForElement()`) to detect DOM changes, with fixed-delay fallbacks
4. Scrolls through transcript container to load all virtualized segments (`scrollToLoadAllSegments()`)
5. Queries transcript segments via `YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS`
6. Extracts timestamp and text from each segment using constant selector arrays
7. Formats as `[timestamp] text` per line
8. If Distill opened the panel, auto-closes it via `TRANSCRIPT_PANEL_CLOSE` selectors

**Scroll-to-load helpers:**
- `findScrollableParent(element)` — Walks up DOM to find nearest scrollable ancestor
- `scrollToLoadAllSegments(container, segmentSelector)` — Scrolls container in viewport-height increments, waits `SCROLL_STEP_DELAY` ms between steps, exits after 2 consecutive stable segment counts or `SCROLL_MAX_ITERATIONS`

**Multiple selector fallbacks** for YouTube UI resilience:
```javascript
const timestampElement = segment.querySelector('.segment-timestamp') ||
                        segment.querySelector('[class*="segment-timestamp"]') ||
                        segment.querySelector('div[class*="cue-group"] div[class*="cue"]:first-child');
```

### popup.js (Main UI Logic)

Flow:
1. Validates user is on YouTube `/watch?v=` page
2. Injects `content.js` dynamically if needed
3. Sends `{ action: 'openTranscriptModal' }` to content script
4. Content script delegates to `TranscriptOrchestrator.extractAndDisplay()`
5. Popup closes after modal opens on YouTube page

### settings.js (Settings Management)

**Default Prompt:**
`DEFAULT_PROMPT` constant provides a concise summary template for new users (Key Takeaways, Breakdown up to 5 topics, Notable Details with timestamps). Pre-filled when no `customPrompt` exists in storage.

**Per-Provider API Key Storage:**
`currentVisualProvider` tracks the UI's active provider. On provider switch, the outgoing key is auto-saved to `openaiApiKey`/`claudeApiKey` before loading the incoming provider's key. Save handler writes both `apiKey` (legacy) and the per-provider key.

**Model Caching Pattern:**
```javascript
let cachedModels = { openai: null, claude: null };

// Only fetch if not cached or force refresh
if (!forceRefresh && cachedModels[provider]) {
  populateModelSelect(cachedModels[provider]);
  return;
}
```

**Auto-fetch on API key blur:**
When user enters API key and moves to next field, automatically fetches available models.

**Claude Model List:**
Fetched dynamically from Anthropic's `/v1/models` endpoint (v4.2.0+). Falls back to a hardcoded list in background.js when the API key is missing or the endpoint fails. Settings.js delegates model fetching via message passing to background.js.

### constants.js (Shared Constants)

Defines `YTE_CONSTANTS` object with:
- **Timing values:** `TOAST_DURATION`, `MUTATION_TIMEOUT`, `ERROR_RESET_DELAY`, etc.
- **Scroll-to-load:** `SCROLL_STEP_DELAY` (150ms), `SCROLL_MAX_ITERATIONS` (100)
- **Cache limits:** `MAX_CACHED_VIDEOS` (10), `MAX_CHAT_MESSAGES` (20)
- **API defaults:** `DEFAULT_MAX_TOKENS_OPENAI` (4000), `NANO_MAX_TOKENS` (16384), `CHAT_CONTEXT_CHAR_LIMIT` (4000)
- **Retry settings:** `MAX_RETRIES` (2), `RETRY_DELAYS`, `RETRYABLE_STATUS_CODES` (429, 500, 502, 503, 529)
- **YouTube selectors:** `SELECTORS.DESCRIPTION_EXPAND[]`, `SELECTORS.SHOW_TRANSCRIPT_BUTTON[]`, `SELECTORS.MORE_ACTIONS[]`, `SELECTORS.TRANSCRIPT_SEGMENTS`, `SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY`, `SELECTORS.SEGMENT_TIMESTAMP[]`, `SELECTORS.SEGMENT_TEXT[]`, `SELECTORS.VIDEO_TITLE[]`, `SELECTORS.SIDEBAR[]`, `SELECTORS.TRANSCRIPT_CONTAINER[]`, `SELECTORS.TRANSCRIPT_PANEL_CLOSE[]`, `SELECTORS.MENU_ITEMS`, `SELECTORS.MENU_POPUP`

Loaded first in manifest (before `utils.js`). Object is frozen to prevent mutation.

### chat-manager.js (Chat Conversation State)

Manages per-video chat conversation state:
- `ChatManager.addMessage(videoId, role, content)` - Appends to in-memory history
- `ChatManager.getHistory(videoId)` - Returns message array
- `ChatManager.loadHistory(videoId, history)` - Loads from cache
- `ChatManager.getConversationPayload(videoId, contextText, provider)` - Builds API messages array with summary as system context
- `ChatManager.clearHistory(videoId)` - Resets conversation
- `ChatManager.hasHistory(videoId)` - Boolean check

**Token budget:** Uses summary (~500-1000 tokens) as context instead of full transcript. Falls back to first 4000 chars of transcript if no summary. 20-message limit per video.

**Provider differences:** OpenAI uses system message in messages array. Claude uses top-level `system` parameter.

### v3.0+ Components (Content Scripts)

#### utils.js (Shared Utilities)

Provides shared functions for all content scripts:
- `Utils.logError()` - Structured error logging with context and metadata
- `Utils.escapeHtml()` - Sanitizes HTML for safe display
- `Utils.markdownToHtml()` - Converts markdown to HTML for AI summaries
- `Utils.copyRichText(plainText, html)` - Copies to clipboard with dual format support (plain text + HTML)
- Used by modal-ui.js, transcript-orchestrator.js, and other content scripts

#### theme-detector.js (Theme Detection)

Detects YouTube's current theme (light/dark mode):
- Checks `html[dark]` attribute on document root
- Returns boolean `isDark` flag
- Used by modal-ui.js and content-injector.js for theme-aware styling

```javascript
const isDark = document.documentElement.hasAttribute('dark');
```

#### cache-manager.js (Local Cache with LRU Eviction)

Manages local cache for transcripts and AI summaries:
- Stores up to 10 most recent videos (LRU eviction)
- Uses Chrome `chrome.storage.local` (not synced across devices)
- Cache key: video ID
- Cache entry: `{ videoId, videoTitle, transcript, summary, chatHistory, timestamp }`
- Methods: `CacheManager.getCachedData()`, `CacheManager.setCachedData()`, `CacheManager.isCacheValid()`
- Automatic eviction of oldest entries when cache exceeds 10 items

**Storage format:**
```javascript
{
  'transcript_cache_videoId1': { videoId, videoTitle, transcript: {...}, summary: {...}, chatHistory: [], timestamp },
  'transcript_cache_videoId2': { ... },
  'transcript_cache_metadata': { videoIds: [...], lastCleanup: timestamp }
  // up to 10 entries
}
```

#### modal-ui.js (Modal UI System)

**v3.0.1 Architecture: Floating Corner Modal (No Overlay)**

Creates and manages a floating modal in the bottom-right corner:
- **No backdrop overlay** - allows video interaction while modal is open
- **Fixed positioning:** `bottom: 24px; right: 24px`
- **Compact size:** 450px width, 600px max height
- **Mobile responsive:** Full-screen on devices ≤768px

**Key methods:**
- `ModalUI.createModal(data, isDark)` - Creates floating modal directly in document.body
- `ModalUI.showLoading(isDark)` - Shows loading spinner while extracting
- `ModalUI.showError(message, isDark)` - Shows error state
- `ModalUI.close()` - Removes modal from DOM, shows FAB
- `ModalUI.minimize()` - Collapses to compact "Distill" branded pill, preserves state
- `ModalUI.expand()` - Restores from minimized state
- `ModalUI.updateStreamingContent(partialText, isFinal)` - Progressive streaming display
- `ModalUI._switchTab(tabName)` - Switches between Transcript/Summary tabs
- `ModalUI._buildChatHTML(data)` - Renders chat bubbles in Summary tab
- `ModalUI._appendChatMessage(role, content)` - Appends single bubble without full re-render
- `ModalUI._handleChatSend(data)` - Reads input, calls orchestrator, appends response
- `ModalUI._copyToClipboard(text, message, type)` - Copies content with rich text support

**v3.0.1 Features:**
1. **AI Summary Default Tab:** When `data.summary` exists, AI Summary tab is active by default
2. **Settings Gear Icon:** Header includes SVG gear button that opens settings.html in new tab
3. **Floating Corner Design:** Modal appears in bottom-right without backdrop, keeping video accessible

**Modal structure:** Header (title, settings gear, minimize, close) → Tabs (Transcript/Summary segmented control) → Content (tab panels, chat area in Summary) → Footer (regenerate, copy buttons). See `modal-ui.js` source for full DOM structure.

**Close behavior:**
- Close button (×) - removes modal
- Escape key - removes modal
- No click-outside-to-close (no overlay to click)

#### modal-styles.css (Modal Styling)

Apple HIG flat design styles for the floating corner modal:
- CSS variables for light/dark themes (Apple HIG color palette)
- `.yte-modal` - Frosted glass floating corner (`backdrop-filter: blur(20px)`)
- `.yte-modal-header-actions` - Flex container for settings + minimize + close buttons
- `.yte-modal-settings` - SVG gear icon button (no emoji)
- `.yte-modal-minimize` - Minimize button matching header button style
- `.yte-modal.yte-minimized` - Frosted glass pill, same fixed bottom-right position
- `.yte-modal-tabs-container` - iOS segmented control (pill bg, active white/dark surface)
- `.yte-tab-btn` - Segmented control segments with active shadow
- `.yte-chat-*` - Chat UI: bubbles (user/assistant), input row, typing indicator
- `.yte-stream-cursor` - Blinking cursor during streaming
- `.yte-toast` - Pill-shaped, centered bottom, frosted glass background
- `.yte-btn` - Flat buttons with opacity hover (no box-shadow, no translateY)
- Responsive: full-screen on mobile (≤768px), minimize hidden
- Font: SF Pro system font stack (`-apple-system, BlinkMacSystemFont, ...`)

**Theme variables:** Apple HIG color palette via CSS custom properties (`--yte-bg`, `--yte-text`, `--yte-accent`, `--yte-modal-bg`). Light uses `#F2F2F7`/`#007AFF`, dark uses `#1C1C1E`/`#0A84FF`. See `modal-styles.css` for full variable definitions.

#### transcript-orchestrator.js (Unified Extraction Flow)

Orchestrates the entire transcript extraction and display flow:

**Flow:**
1. Check if video is cached (`CacheManager.has(videoId)`)
2. If cached: Load from cache and display modal immediately
3. If not cached: Extract transcript via `content.js`
4. Save to cache with `CacheManager.set()`
5. Display modal with transcript (and AI summary if available)

**API:**
- `TranscriptOrchestrator.extractAndDisplay(videoId, source)` - Main entry point
- `TranscriptOrchestrator.regenerateSummary(videoId, transcript)` - Regenerate with streaming
- `TranscriptOrchestrator.sendChatMessage(videoId, userMessage)` - Send chat message
- `TranscriptOrchestrator._resolveApiKey(settings)` - Returns per-provider key, falls back to legacy `apiKey`
- `TranscriptOrchestrator._streamFromPort(portName, request)` - Stream AI response via background port
- `TranscriptOrchestrator._processWithAI(transcript, isDark)` - Streaming-first with non-streaming fallback

**Usage:**
Called by both popup.js (extension icon) and content-injector.js (FAB button)

#### content-injector.js (Floating FAB Entry Point)

Injects a distinctive floating purple pill FAB (Floating Action Button) on YouTube video pages:

**Features:**
- Desktop only (checks viewport width > 768px)
- Fixed position: `bottom: 90px; right: 24px;` (above modal area)
- Purple background (`#6C5CE7`), white text, pill shape (`border-radius: 100px`), shadow
- Inline SVG icon (white document with play triangle) before text label — avoids CSP issues with `chrome-extension://` image URLs
- Hover: `scale(1.05)` + enhanced shadow
- Hides when modal is open, reappears when modal closes
- `yt-navigate-finish` event listener for SPA navigation (no interval polling)
- Button text changes based on cache state:
  - "Distill" - First time (not cached)
  - "View" - Cached (instant load)
  - "Loading..." - During extraction
  - "Try Again" - After error

**Button placement:**
```javascript
document.body.appendChild(this.button); // Fixed position, not in sidebar
```

## Critical Code Patterns

### Chrome Storage (Sync)

Settings persist across Chrome browsers (encrypted by Chrome):

```javascript
// Save
chrome.storage.sync.set({
  apiProvider: 'openai',
  apiKey: 'sk-...',          // Derived: equals active provider's key (backward compat)
  openaiApiKey: 'sk-...',    // Per-provider key (persists across provider switches)
  claudeApiKey: 'sk-ant-...', // Per-provider key (persists across provider switches)
  customPrompt: '...',
  model: 'gpt-4o'
});

// Load
const settings = await chrome.storage.sync.get([
  'apiProvider', 'apiKey', 'openaiApiKey', 'claudeApiKey', 'customPrompt', 'model'
]);
// Use TranscriptOrchestrator._resolveApiKey(settings) to get the active provider's key
```

### YouTube DOM Resilience

Always use multiple fallback selectors:

```javascript
const button = document.querySelector('button[aria-label="More actions"]') ||
               document.querySelector('button[aria-label*="More"]') ||
               document.querySelector('ytd-menu-renderer button');
```

YouTube frequently updates their DOM structure. Multiple selectors increase resilience.

### DOM Waiting Strategy

v4.0 uses `MutationObserver` via `waitForElement(selector, timeout)` to detect DOM changes:
- Watches for menu popup after clicking "More actions"
- Watches for transcript segments after clicking "Show transcript"
- Falls back to fixed delays (800ms, 1500ms) if MutationObserver times out (3000ms safety net)
- Selectors are centralized in `YTE_CONSTANTS.SELECTORS`

## Version History

**v4.3.5** (2026-04-15) - Current
- **Segment text wrapper class fix**: YouTube migrated the per-segment text wrapper from `.yt-core-attributed-string` to `.ytAttributedStringHost`. Without this fix, panel opens correctly but the extraction loop's text selectors find nothing → "Transcript panel found but could not extract text" error.
- Prepended `.ytAttributedStringHost` and `span[role="text"]` to `SEGMENT_TEXT` in `constants.js`. Older selectors retained as fallback.

**v4.3.4** (2026-04-15)
- **Transcript extraction entry-point fix**: YouTube removed "Show transcript" from the per-video "More actions" (3-dot) menu, breaking extraction for every video
- New primary path in `content.js`: `tryDescriptionExpanderPath()` — expands description (`#expand`) and clicks the inline `button[aria-label="Show transcript"]`. Falls back to `tryMenuPath()` (legacy menu) if the new path fails.
- Scoped `MORE_ACTIONS` selectors to `ytd-watch-metadata` to avoid matching one of 28+ "More" buttons on the page (sidebar videos, hidden controls)
- Added `DESCRIPTION_EXPAND` and `SHOW_TRANSCRIPT_BUTTON` selector arrays to `constants.js`
- Added `docs/youtube-dom-layout.md` — living reference doc capturing the current YouTube DOM layout, breakage history, and a next-time diagnostic checklist

**v4.3.3** (2026-04-07)
- **Markdown list rendering fix**: Indented list items (`  - item`) in AI summaries now render as proper bullets instead of plain text with visible `-`
- Updated `markdownToHtml()` regexes to allow optional leading whitespace for unordered and ordered lists

**v4.3.2** (2026-03-11)
- **Scroll-to-load fix for panel open**: Added 500ms settle delay after Distill opens transcript panel, fixing extraction returning only ~4-5 segments
- **Broader TRANSCRIPT_CONTAINER selectors**: Added `ytd-engagement-panel-section-list-renderer` selectors for YouTube's engagement panel DOM
- **Diagnostic logging**: `[Distill]`-prefixed console logs at key extraction decision points

**v4.3.1** (2026-03-11)
- **Full Transcript Extraction**: Scroll-to-load logic handles YouTube's virtual scrolling, extracting all segments instead of ~10-20
  - `scrollToLoadAllSegments()` scrolls through transcript container to force all segments into the DOM
  - `findScrollableParent()` walks up DOM to find scrollable ancestor as fallback
  - New constants: `SCROLL_STEP_DELAY` (150ms), `SCROLL_MAX_ITERATIONS` (100)
  - New selector arrays: `TRANSCRIPT_CONTAINER`, `TRANSCRIPT_PANEL_CLOSE`
- **Auto-close Transcript Panel**: Panel is closed after extraction if Distill opened it, preserving user's UI state
  - `weOpenedPanel` flag tracks whether Distill opened the panel vs. it was already open

**v4.3.0** (2026-03-11)
- **Transcript Extraction Fix**: Updated DOM selectors for YouTube's view model migration (Feb 2026)
  - Primary: `transcript-segment-view-model`, `.ytwTranscriptSegmentViewModelTimestamp`, `.yt-core-attributed-string`
  - Legacy Polymer selectors kept as automatic fallback via `TRANSCRIPT_SEGMENTS_LEGACY`
  - `content.js` tries new selectors first, falls back to legacy if no segments found

**v4.2.1** (2026-03-04)
- Extension name updated to "Distill: YouTube AI Summaries & Chat — Direct API, No Servers" for Chrome Web Store discoverability

**v4.2.0** (2026-03-04)
- **Dynamic Claude Model List**: Fetched live from `/v1/models` API instead of hardcoded
  - Falls back to curated list when API key is missing or endpoint fails
  - Removed deprecated Claude 3.x models from fallback list
  - Added Claude Sonnet 4.6, Sonnet 4, Opus 4 to fallback list
- **529 Overloaded Retry**: Added HTTP 529 to retryable status codes in both `constants.js` and `background.js`

**v4.1.0** (2026-02-27)
- **Per-Provider API Key Storage**: Both OpenAI and Claude API keys now persist independently
  - Switching providers no longer overwrites the previous key
  - New storage keys: `openaiApiKey`, `claudeApiKey` alongside legacy `apiKey` for backward compat
  - Auto-saves outgoing provider's key when switching in settings
  - Automatic one-time migration from legacy `apiKey` on settings load
  - Content scripts fall back to legacy `apiKey` via `_resolveApiKey()` before migration runs
- **Default Prompt for New Users**: Pre-fills a concise summary prompt template
  - Structured output: Key Takeaways, Breakdown (up to 5 major topics), Notable Details
  - Includes timestamps for navigation
  - Existing users keep their saved custom prompt

**v4.0.3** (2026-02-16)
- **FAB Inline SVG Icon**: Replaced `<img>` tag loading `icon16.png` with inline SVG to fix icon not rendering on YouTube
  - Root cause: YouTube's Content Security Policy blocks CSS filters on images loaded from `chrome-extension://` URLs in content scripts, making the icon invisible
  - Inline SVG bypasses CSP entirely — renders a white document icon with purple play triangle and transcript lines matching the extension's icon design
  - Removed the v4.0.2 CSS filter workaround (`brightness(0) invert(1)`) that was ineffective

**v4.0.2** (2026-02-16) - Compact minimized pill, save button feedback, status message visibility fix
**v4.0.1** (2026-02-16) - GPT-5-nano fix (token limit 2000→16384), null content validation, duplicate modal fix
**v4.0.0** (2026-02-15) - Chat, streaming, MutationObserver extraction, minimize modal, FAB entry point, constants.js refactor
**v3.1.0** (2026-01-30) - Apple HIG UI redesign
**v3.0.x** (2026-01-18–20) - In-page modal, caching, regenerate, context invalidation fix, rich text copy, Arc compat
**v2.x** (2026-01-09–18) - Settings panel, OpenAI/Claude API integration, model fetching
**v1.x** - Initial release, timestamp extraction

See `git log` for full details on older versions.

## Versioning

Semantic versioning (MAJOR.MINOR.PATCH):
- **MAJOR** (x.0.0): Breaking changes
- **MINOR** (x.y.0): New features
- **PATCH** (x.y.z): Bug fixes

Increment by 0.0.1 for patches, 0.1.0 for features.

**Files requiring version updates:**
- `manifest.json` — `"version"` field
- `CHANGELOG.md` — new version entry at top
- `CLAUDE.md` — `Current Version` in Project Overview, Version History entry, `Current Version` in footer

## Testing Checklist

Manual testing required (no automated tests). Key areas to verify:

- **Core:** Extension loads, transcript extraction works (TED Talks, music videos), timestamps formatted `[0:00] text`, error messages for videos without transcripts, long videos (10+ min) extract full transcript (not truncated)
- **Entry path:** Console shows `[Distill] Description expand matched` → `Show transcript button matched` → `Panel opened via description expander path`. Menu fallback only fires if description path returns false.
- **Entry Points:** FAB appears on desktop, hides when modal opens, both FAB and extension icon open same modal
- **Modal:** Bottom-right floating, no backdrop overlay, tab switching (Transcript/Summary), copy buttons, close (× and Escape), settings gear opens settings page
- **Chat:** Input below summary, send via Enter/button, works with OpenAI and Claude, history persists across minimize/expand, clears on regenerate, 20-message limit
- **Streaming:** Progressive text display, works with both providers, fallback to non-streaming, no errors when closing mid-stream
- **Minimize:** Collapses to pill, expands with state preserved (tab, scroll, chat), navigation closes pill
- **Caching:** First extraction caches, revisit loads instantly, 11th video evicts oldest, cache persists across sessions
- **Settings:** Settings persist, API keys load per-provider, models auto-fetch on key entry, AI summary appears in modal
- **Scroll-to-load:** Long videos extract full transcript, short videos still work, scroll container found via selectors or DOM walk
- **Panel auto-close:** Panel opened by Distill closes after extraction, panel already open stays open
- **GPT-5-nano:** Uses 16384 token limit, transient errors (429/500/502/503) trigger retry (max 2)

## When YouTube transcript extraction breaks

Read `docs/youtube-dom-layout.md` first — it has the current selectors, breakage history (v4.3.0 → v4.3.5 so far), a next-time diagnostic checklist, the Playwright probe pattern (with the Trusted Types CSP gotcha), and a verification recipe. Update it on every layout-change fix, before bumping CHANGELOG.

## Known Limitations

1. **YouTube UI Dependency:** Relies on specific DOM selectors that may break when YouTube updates (centralized in `constants.js`)
2. **MutationObserver + Fallback Delays:** MutationObserver with 3s timeout, falls back to fixed delays if observer fails
3. **Only `/watch?v=` URLs:** Doesn't work on playlists, channels, homepage
4. **FAB desktop only:** Floating button only appears on desktop (viewport > 768px)
5. **Cache size limit:** Only 10 most recent videos cached (LRU eviction)
6. **Cache not synced:** Cache uses `chrome.storage.local` and doesn't sync across devices
7. **Claude Model List Fallback:** Dynamic fetching from `/v1/models` requires a valid API key; without one, the hardcoded fallback list is used
8. **Token Limits:** OpenAI max_tokens=4000 (GPT-5-nano: 16384 for reasoning headroom), Claude max_tokens=4096
9. **Modal z-index conflicts:** Modal uses z-index 999999, FAB uses 999998
10. **Chat context limited:** Chat uses summary (not full transcript) as context to manage tokens. Max 20 messages per video.
11. **Streaming partial markdown:** During streaming, raw text is shown (not rendered markdown). Full markdown rendered on completion.
12. **MV3 service worker timeout:** Active fetch keeps service worker alive, but streaming may disconnect on very long responses (30s idle timeout)
13. **Timedtext API non-functional:** YouTube's timedtext URLs return empty responses (as of March 2026). Cannot be used for transcript extraction from content scripts.
14. **InnerTube get_transcript requires auth:** The `/youtubei/v1/get_transcript` endpoint returns `400 FAILED_PRECONDITION` — content scripts can't replicate YouTube's internal SAPISIDHASH auth.

## Security Notes

**Permissions:**
- `activeTab` - Access current tab only
- `scripting` - Inject content.js dynamically
- `clipboardWrite` - Copy transcripts
- `storage` - Chrome sync storage (encrypted)
- Host permissions: youtube.com, api.openai.com, api.anthropic.com

**API Keys:**
- Stored in Chrome's encrypted sync storage
- Never transmitted except to the selected API provider
- User responsible for key security and rotation

**No external services:** Extension doesn't send data to any third parties. API calls go directly to OpenAI/Claude.

## YouTube Internal Data Structures

- `ytInitialPlayerResponse` — Embedded in page `<script>` tags, contains `captions.playerCaptionsTracklistRenderer.captionTracks[]` with `baseUrl` for timed text API
- `ytInitialData` — Contains engagement panels including `engagement-panel-searchable-transcript` with lazy-loaded transcript via `/youtubei/v1/get_transcript`
- Content scripts can't access `window.ytInitialPlayerResponse` (isolated world) — must parse from script tags or Polymer `__data` on `ytd-watch-flexy`
- **Timedtext API non-functional (as of March 2026):** Fetching timedtext URLs (`/api/timedtext?...&fmt=json3`) returns `200` with empty body in both JSON3 and XML formats. YouTube appears to have deprecated direct timedtext URL fetching.
- **InnerTube `get_transcript` API requires auth:** Returns `400 FAILED_PRECONDITION` even with SAPISIDHASH. Content scripts can't replicate YouTube's internal auth.
- **YouTube DOM layout:** `docs/youtube-dom-layout.md` is the source of truth for current selectors, breakage history, and the next-time diagnostic checklist. Update it on every layout-change fix.
- `getPlayerResponse()` on `#movie_player` returns captions data, but the URLs it provides are non-functional

## Project Management

- Linear workspace: Engineering team. Use `mcp__claude_ai_Linear__*` MCP tools for issue management.
- Linear project: "v4.3 - Transcript Update" under initiative "Distill - Youtube Extraction"
- Linear issue states: Check available states with `list_issue_statuses` before setting state — workspace may not have "Cancelled" as a state name.
- Planning docs stored in `docs/`
- **YouTube DOM layout reference:** `docs/youtube-dom-layout.md` — living document of the current transcript DOM, breakage history, and a next-time diagnostic checklist. Read this first when extraction breaks; update it on every layout-change fix.

## Planned Changes

No planned changes at this time.

## Git Workflow

**Branches:**
- `main` - Stable branch (contains v4.3.5). Default branch on GitHub.
- `v2.0`, `v3.0` - Version branches (merged into main)
- `v2.0-feature-expansion`, `v3-enhancements` - Feature branches (archived)
- `v1.1-timestamp` - Old stable branch name (replaced by main, can be deleted)

**Workflow:**
1. Create feature branches from `main`
2. Name feature branches descriptively (e.g., `v3.1-feature-name` or `bugfix-description`)
3. All pull requests should target `main` branch
4. After merging, version branches can be kept for reference

### Pre-Commit Documentation Checklist

**Before every commit and push**, ensure the following documentation is up to date with the changes being committed:

**CLAUDE.md updates (required if any of these changed):**
- [ ] Version number in "Project Overview" and "Last Updated" footer
- [ ] Version History section with new entry describing the changes
- [ ] Architecture Overview if files were added, removed, or renamed
- [ ] Component descriptions if behavior or API of a component changed
- [ ] Key Components section if new functions, parameters, or message types were added
- [ ] Critical Code Patterns if new patterns were introduced
- [ ] Testing Checklist if new testable behavior was added
- [ ] Known Limitations if new limitations were introduced or existing ones resolved

**README.md updates (required if any of these changed):**
- [ ] Version number and feature descriptions
- [ ] Installation or usage instructions if the user-facing workflow changed
- [ ] Screenshots or feature list if visible UI changed
- [ ] Any user-facing information that no longer matches the code

**Rule:** Do not commit code changes without also committing the corresponding documentation updates in the same commit. If only documentation changed, that's fine as a standalone commit.

---

**Last Updated:** 2026-04-15
**Current Version:** 4.3.5
