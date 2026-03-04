# Distill

A Chrome extension that distills YouTube videos into transcripts, AI summaries, and conversational chat — powered by OpenAI or Claude.

**Current Version:** 4.2.1

## What's New in v4.2.1

- **Updated Extension Name** - Now "Distill: YouTube AI Summaries & Chat — Direct API, No Servers" for better Chrome Web Store discoverability

## Previous Releases

**v4.2.0** - Dynamic Claude model fetching from `/v1/models` API, 529 overloaded retry support

**v4.1.0** - Per-provider API key storage, default prompt for new users

**v4.0.3** - FAB inline SVG icon (CSP fix), compact minimized pill, settings save feedback

**v4.0.1** - GPT-5-nano fix (increased token limit from 2,000 to 16,384 for reasoning headroom)

**v4.0.0** - Conversational AI chat, streaming API responses, MutationObserver extraction, minimize modal, floating FAB, Claude Opus 4.6

**v3.1.0** - Apple/iOS native UI redesign with frosted glass, segmented controls, flat buttons

**v3.0.6** - Regenerate AI summary button in modal footer

**v3.0.5** - Extension context invalidation error handling

**v3.0.0** - Major release: in-page button, smart caching, floating modal UI, dual entry points, theme detection

## Features

- **Two ways to access:** Floating purple FAB (desktop only) or extension icon
- **AI Chat:** Chat with AI about video content after generating a summary
- **Streaming responses:** AI summaries stream in real-time with progressive text display
- **Smart caching:** Transcripts, AI summaries, and chat history cached for the 10 most recent videos
- **Minimize modal:** Collapse to a frosted glass pill, expand to restore full state
- **Frosted glass modal:** Bottom-right corner modal with backdrop blur, keeps video accessible
- **Quick settings access:** Settings gear icon in modal header
- **AI Summary prioritized:** When AI summary exists, it shows as the default tab
- **Per-provider API keys:** Save separate keys for OpenAI and Claude — switch providers without losing either key
- **Default prompt included:** New users get a structured summary template out of the box
- **Extract transcripts** from any YouTube video with captions
- **Timestamps included** with each transcript line
- **AI Processing** - Process transcripts with custom prompts using OpenAI or Claude APIs
- **Custom Prompts** - Define your own prompts for AI processing (summarization, translation, analysis, etc.)
- **Dynamic Model Selection** - Automatically fetches available models from your API account
- **Settings Panel** - Easy-to-use interface for API configuration
- **Theme-aware** - Automatically matches YouTube's light/dark mode
- **Copy to clipboard** with one click for both transcript and AI summary (rich text support)
- **Clean interface** with automatic transcript panel opening

## Installation

### Step 1: Download the Extension

Clone or download this repository to your local machine. All necessary files including icons are included.

### Step 2: Load Extension in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" using the toggle in the top-right corner
3. Click "Load unpacked"
4. Select the `youtube-transcript-extension` folder
5. The extension should now appear in your extensions list

## Usage

### Quick Access (Floating FAB - Desktop Only)

1. Navigate to any YouTube video (desktop only, not mobile)
2. Look for the purple **"Distill"** floating pill button in the bottom-right corner
3. Click the button
4. A modal will appear in the bottom-right corner with the transcript
   - **First time:** Button shows "Distill" and extracts the transcript (with streaming AI summary if configured)
   - **Cached:** Button shows "View" and loads instantly
   - **AI Summary tab:** Shown first when AI summary exists
5. Use the segmented control tabs to switch between "Transcript" and "Summary" (if configured)
6. **Chat:** Below the summary, use the chat input to ask questions about the video
7. **Minimize:** Click the minus button to collapse the modal to a small pill
8. Click the **gear icon** in the modal header to access Settings
9. Click "Copy Transcript" or "Copy Summary" to copy to clipboard
10. Video remains playable while modal is open

### Extension Icon Method (Works Everywhere)

1. Navigate to any YouTube video
2. Click on the extension icon in your Chrome toolbar
3. Click "Extract & Copy Transcript" button
4. A modal will appear in the bottom-right corner of the YouTube page with the transcript
5. The popup will automatically close after opening the modal
6. Click the **gear icon** in the modal header to access Settings (or use the gear icon in the popup)

### Advanced Usage (AI Processing)

1. Click the **gear icon** to open Settings (available in extension popup OR modal header)
2. Select your **API Provider** (OpenAI or Claude)
3. Enter your **API Key** (each provider's key is saved independently — switching providers won't lose your key)
   - For OpenAI: Get your key from [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
   - For Claude: Get your key from [console.anthropic.com](https://console.anthropic.com/)
4. Models will **automatically load** when you enter your API key
5. Customize the **Prompt** (a default summary template is pre-filled for new users)
6. Select your preferred **Model**
7. Click **Save Settings**
8. Now when you extract a transcript:
   - Transcript is extracted from the video
   - Sent to the AI with your custom prompt
   - The AI summary appears in a separate "AI Summary" tab (shown first by default)
   - Both transcript and summary are displayed in the modal

## Output Format

### Basic Mode (No AI)
The transcript will be formatted with timestamps like this:
```
[0:00] First line of the transcript
[0:05] Second line of the transcript
[0:12] Third line continues here
```

### AI Mode (With Custom Prompt)
The output will be whatever your AI model generates based on your custom prompt. For example:
- Summarization: Bullet-point summary of the video
- Translation: Translated transcript in another language
- Analysis: Key insights and takeaways
- Custom formatting: Any format you specify in your prompt

## How It Works

### Basic Extraction
1. Detects when you're on a YouTube video page
2. Checks local cache first (instant if cached!)
3. If not cached: Automatically opens the transcript panel (if not already open)
4. Extracts all transcript segments with their timestamps
5. Formats them as `[timestamp] text` on each line
6. Opens a floating modal in the bottom-right corner
7. Displays the transcript in the modal with copy buttons (video remains accessible)

### AI Processing (Optional)
1. Extracts the transcript (steps 1-5 above)
2. Sends the transcript to your selected API (OpenAI or Claude)
3. Applies your custom prompt to the transcript
4. Returns the AI-processed result
5. Displays both transcript and AI summary in separate tabs
6. Both transcript and summary are cached together

### Caching System
- **10 most recent videos** are cached locally in your browser
- Cached data includes: transcript, AI summary (if processed), chat history, video title, timestamp
- Cache persists across browser sessions (doesn't expire)
- When you revisit a video, the modal opens instantly with cached data
- Oldest videos are automatically removed when the cache reaches 10 videos (LRU eviction)
- Cache is private to your browser (not synced across devices)

## Troubleshooting

### Transcript Extraction Issues

**"No transcript found"**
- The video may not have captions/subtitles enabled
- Try manually opening the transcript on YouTube first (click ⋯ below video → "Show transcript")
- Wait a moment after the page loads, then try the extension again
- Some videos may have transcripts disabled by the creator

**"Please open a YouTube video page"**
- Make sure you're on a video page (URL contains `/watch?v=`)
- The extension only works on video pages, not the homepage or other YouTube pages

**"Could not establish connection" error**
- Reload the extension: Go to `chrome://extensions/` and click the refresh icon
- Refresh the YouTube page
- Try clicking the extension button again

**Extension doesn't appear or won't load**
- Check that all files are in the `youtube-transcript-extension` folder
- Verify icon files (icon16.png, icon48.png, icon128.png) exist
- Try reloading the extension from `chrome://extensions/`

### AI Processing Issues

**"Failed to load models"**
- Check that your API key is correct
- Verify your API key has permissions to list/use models
- For OpenAI: Ensure your account has credits
- For Claude: Ensure your API key is active
- Click the Refresh button to retry

**"AI processing failed"**
- Check your API key is valid and not expired
- Verify you have sufficient API credits
- Check the selected model is available in your account
- If the error persists, the original transcript will be copied instead

**Models not loading automatically**
- After entering your API key, click outside the input field (blur event)
- Or click the Refresh button next to the model dropdown
- Check browser console for any error messages

## Files

### Core Files
- `manifest.json` - Extension configuration and permissions
- `popup.html/js/css` - Extension popup interface
- `settings.html/js/css` - Settings page interface
- `background.js` - Service worker for API calls, streaming ports, chat handlers (CORS bypass)
- `CLAUDE.md` - Technical documentation for developers

### Content Scripts (run on YouTube pages)
- `constants.js` - Shared constants (timing, selectors, limits)
- `utils.js` - Shared utility functions
- `theme-detector.js` - YouTube theme detection (light/dark mode)
- `cache-manager.js` - Local cache management with LRU eviction
- `chat-manager.js` - Per-video chat conversation state management
- `modal-ui.js` - Modal interface, chat UI, streaming display, minimize
- `modal-styles.css` - Modal styling with theme support, chat and minimize styles
- `transcript-orchestrator.js` - Unified extraction, streaming, and chat flow
- `content.js` - YouTube transcript extraction with MutationObserver
- `content-injector.js` - Floating purple FAB entry point

### Assets
- `icon.svg` - Icon source file (for customization)
- `icon16.png`, `icon48.png`, `icon128.png` - Extension icons (included)

## Privacy & Security

This extension:
- Only runs on YouTube pages
- **API keys are stored locally** in Chrome's sync storage (encrypted by Chrome)
- API keys are **never sent anywhere** except to the selected API provider (OpenAI or Claude)
- Does not collect or transmit any data to third parties
- Does not require YouTube account access
- Only accesses the current tab when you click the extract button
- All API calls are made directly from your browser to the API provider

**Important:** Your API keys are stored securely in your browser using Chrome's storage API. They sync across your Chrome browsers if you're signed in, but remain encrypted and private to your Chrome profile.

## License

This project is licensed under the [MIT License](LICENSE).
