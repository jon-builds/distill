# Changelog

All notable changes to Distill (YouTube Transcript Extractor) will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [4.2.1] - 2026-03-04

### Changed
- Extension name updated to "Distill: YouTube AI Summaries & Chat — Direct API, No Servers" for better Chrome Web Store discoverability

## [4.2.0] - 2026-03-04

### Changed
- Claude model list now fetched dynamically from `/v1/models` API endpoint instead of hardcoded
- Hardcoded list kept as fallback when API key is missing or endpoint fails
- Removed deprecated Claude models (3.5 Haiku, 3.5 Sonnet v1/v2, 3.7 Sonnet, 3 Opus/Sonnet/Haiku)
- Added Claude Sonnet 4.6, Sonnet 4, and Opus 4 to fallback list

### Fixed
- Added HTTP 529 (Anthropic overloaded) to retryable status codes in both `constants.js` and `background.js`

## [4.1.0] - 2026-02-27

### Added
- Per-provider API key storage: both OpenAI and Claude keys persist independently across provider switches
- New storage keys `openaiApiKey` and `claudeApiKey` alongside legacy `apiKey` for backward compatibility
- Auto-save outgoing provider's key when switching providers in settings
- Automatic one-time migration from legacy `apiKey` on settings load
- Content scripts fall back to legacy `apiKey` via `_resolveApiKey()` before migration runs
- Default prompt template for new users (Key Takeaways, Breakdown, Notable Details with timestamps)

## [4.0.3] - 2026-02-16

### Fixed
- FAB icon not rendering on YouTube due to Content Security Policy blocking `chrome-extension://` image URLs
- Replaced `<img>` tag with inline SVG to bypass CSP entirely
- Removed ineffective v4.0.2 CSS filter workaround (`brightness(0) invert(1)`)

## [4.0.2] - 2026-02-16

### Changed
- Compact minimized pill design

### Fixed
- Save button feedback in settings
- Status message visibility

## [4.0.1] - 2026-02-16

### Fixed
- GPT-5-nano token limit increased from 2000 to 16384 for reasoning headroom
- Null content validation for AI responses
- Duplicate modal creation on rapid clicks

## [4.0.0] - 2026-02-15

### Added
- Multi-turn chat with AI in the Summary tab (OpenAI and Claude)
- Streaming AI responses with progressive text display via `chrome.runtime.connect()` ports
- Minimize modal to compact "Distill" branded pill with state preservation
- Floating Action Button (FAB) entry point on YouTube video pages (desktop only)
- `constants.js` with centralized timing, selectors, limits, and retry settings
- `chat-manager.js` for per-video conversation state management
- `transcript-orchestrator.js` for unified extraction/caching/streaming/chat flow
- MutationObserver-based DOM waiting (replaces fixed delays) with 3s timeout fallback
- Extension rebranded from "YouTube Transcript Extractor" to "Distill"

### Changed
- Transcript extraction uses MutationObserver instead of fixed delays
- YouTube selectors centralized in `YTE_CONSTANTS.SELECTORS`

## [3.1.0] - 2026-01-30

### Changed
- Complete UI redesign following Apple Human Interface Guidelines (HIG)
- Flat design aesthetic with frosted glass effects (`backdrop-filter: blur`)
- SF Pro system font stack
- iOS-style segmented control for tab switching
- Apple HIG color palette via CSS custom properties

## [3.0.6] - 2026-01-20

### Fixed
- Extension context invalidation error handling
- Memory leaks and duplicate code removal

## [3.0.5] - 2026-01-20

### Fixed
- Extension context invalidation errors handled gracefully

## [3.0.4] - 2026-01-19

### Added
- Rich text copy support for AI summaries (dual clipboard: plain text + HTML)
- Dark mode support

### Changed
- Complete UI/UX modernization
- Improved OpenAI model filtering with user-friendly labels
- Curated model list for short text summaries
- GPT-5 frontier models (nano, mini, base) added to recommended list

### Fixed
- OpenAI API compatibility for new and legacy models
- Case-sensitive model detection bug
- Error logging to properly display error messages instead of `[object Object]`
- Modal summary tab label to detect all model types

## [3.0.3] - 2026-01-19

### Changed
- UI improvements for better engagement

## [3.0.2] - 2026-01-18

### Fixed
- Stale modal data when navigating between videos
- Markdown rendering bugs in AI summaries

## [3.0.1] - 2026-01-18

### Added
- Floating corner modal (bottom-right, no backdrop overlay)
- In-page transcript display without leaving YouTube
- Local cache with LRU eviction (10 videos)
- Regenerate AI summary button
- Settings gear icon in modal header
- Theme detection (light/dark mode)

### Changed
- Modal architecture: moved from popup to in-page content script

## [3.0.0] - 2026-01-18

### Added
- Content script architecture for in-page UI
- `modal-ui.js`, `modal-styles.css`, `cache-manager.js`, `theme-detector.js`, `utils.js`

### Changed
- Major architecture shift from popup-only to content script modal

## [2.2.0] - 2026-01-18

### Changed
- Updated API integration and model list

## [2.0.0] - 2026-01-09

### Added
- Settings panel for API configuration
- OpenAI API integration with model fetching
- Claude API integration with hardcoded model list
- Custom prompt support for AI-powered transcript summaries

### Changed
- Extension architecture expanded with `settings.html/css/js` and `background.js`

## [1.1.0] - 2026-01-01

### Added
- Timestamp extraction formatted as `[0:00] text` per line
- Custom extension icons (16px, 48px, 128px)

## [1.0.0] - 2026-01-01

### Added
- Initial release
- YouTube transcript extraction via DOM scraping
- Popup UI with extract button
- Copy transcript to clipboard
