# YouTube Transcript DOM — Layout Reference

Living document. Update on every layout-change fix.

This is the first thing to read when transcript extraction breaks. It captures the DOM path Distill uses to open YouTube's transcript panel, the selectors that matter, and a dated history of every breakage and fix.

---

## Current Layout (as of 2026-04-15, Distill v4.3.5)

### Entry path

Description expander → inline "Show transcript" button.

The old "More actions" (3-dot) menu next to the video title no longer contains a Transcript item — it only shows "Report". Distill now expands the video description and clicks the inline button that appears, falling back to the menu path only if the new path fails.

### Key selectors

| Purpose | Selector | Notes |
|---|---|---|
| Description expander | `ytd-text-inline-expander #expand` | the "...more" link under the video title |
| Show transcript button | `button[aria-label="Show transcript" i]` | inline, appears after expand. `[i]` = case-insensitive |
| More actions (fallback) | `ytd-watch-metadata ytd-menu-renderer button[aria-label*="More" i]` | scope to `ytd-watch-metadata` — page has 28+ matching buttons |
| Menu items | `ytd-menu-service-item-renderer` | currently only contains "Report" for most videos |
| Transcript panel | `ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-searchable-transcript"]` | flips to `visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"` |
| Modern panel (unused) | `[target-id="PAmodern_transcript_view"]` | exists in the DOM but stays hidden |
| Segment | `transcript-segment-view-model` | view-model component (Feb 2026 migration) |
| Segment timestamp | `.ytwTranscriptSegmentViewModelTimestamp` | inside segment |
| Segment text | `.ytAttributedStringHost` (also matches `span[role="text"]`) | inside segment. Migrated from `.yt-core-attributed-string` on/around 2026-04-15 (v4.3.5). |
| Scroll container | `ytd-engagement-panel-section-list-renderer #content` (and 3 others in `TRANSCRIPT_CONTAINER`) | virtualized, must scroll-to-load |
| Close panel | `ytd-engagement-panel-section-list-renderer #visibility-button button[aria-label="Close"]` | actual aria-label is "Close transcript" |

### Network calls

- `POST /youtubei/v1/get_transcript` — lazy-loaded after the panel opens. Requires a logged-in session (SAPISIDHASH). Returns `400 FAILED_PRECONDITION` in headless contexts. Cannot be replicated from content scripts.
- `GET /api/timedtext?...` — returns 200 but empty body (deprecated since March 2026). Do not use.

### Gotchas

- The page contains 28+ `aria-label*="More"` buttons (each sidebar video has one, plus hidden ones in alternate layouts). Always scope to `ytd-watch-metadata`.
- Several `Show transcript` matches exist after expanding the description: a `YTD-BUTTON-RENDERER` wrapper, a `YT-BUTTON-SHAPE` wrapper, and the actual `BUTTON`. Only the inner `BUTTON` reliably propagates clicks — match by `aria-label`, not by text on the wrappers.
- Panel content is lazy-loaded. Segments only appear after the `get_transcript` response. Wait for `transcript-segment-view-model` to appear, then settle 500ms before reading.
- Selectors in `constants.js` are `Object.freeze`-ed — never mutate at runtime.
- Headless Playwright cannot fetch transcripts (no auth context). Use real Chrome to verify segment rendering.

---

## Layout Change History

Newest first. Each entry: what changed, symptom in Distill, how it was diagnosed, the fix.

### 2026-04-15 — Segment text wrapper class migration (fixed in v4.3.5)

- **What changed:** YouTube migrated the per-segment text wrapper from `<yt-formatted-string class="yt-core-attributed-string">` (or similar) to `<span class="ytAttributedStringHost ytAttributedStringLinkInheritColor" role="text">`. Affects new view-model segments (`transcript-segment-view-model`).
- **Symptom:** "Transcript panel found but could not extract text. Please try again." Panel opens, segment count > 0, but `transcriptText` ends up empty because no `SEGMENT_TEXT` selector matched the new wrapper.
- **Diagnosis:** Console probe on `youtube.com/watch?v=wMwrPT4rHDA` returned 336 segments with this structure:
  ```html
  <transcript-segment-view-model class="ytwTranscriptSegmentViewModelHost ...">
    <div class="ytwTranscriptSegmentViewModelTimestamp ...">0:00</div>
    <div class="ytwTranscriptSegmentViewModelTimestampA11yLabel"></div>
    <span class="ytAttributedStringHost ..." role="text">What is a product...</span>
  </transcript-segment-view-model>
  ```
- **Fix:** Prepended `.ytAttributedStringHost` and `span[role="text"]` to `SEGMENT_TEXT`. Older selectors retained as fallback.

### 2026-04-15 — "More actions" menu loses Show transcript (fixed in v4.3.4)

- **What changed:** YouTube removed the "Show transcript" item from the per-video 3-dot "More actions" menu. The menu now only contains "Report".
- **Symptom:** "No transcript found. This video may not have captions available, or the transcript UI has changed." returned for every video.
- **Diagnosis:** Playwright probe found that clicking the (correctly scoped) More actions button opened a menu with only `["Report"]`. Description expand revealed an inline `button[aria-label="Show transcript"]` that opens the same `engagement-panel-searchable-transcript` panel.
- **Fix:** New primary path — `#expand` click → wait → click inner `button[aria-label="Show transcript" i]`. Old menu path retained as fallback. Scoped `MORE_ACTIONS` to `ytd-watch-metadata`.
- **Probe template:** see `Next-time checklist` below.

### 2026-03-11 — Engagement panel container migration (fixed in v4.3.2)

- Added `ytd-engagement-panel-section-list-renderer` selectors to `TRANSCRIPT_CONTAINER`. Added 500ms settle delay after panel open.

### 2026-03-11 — Virtual scrolling truncated transcripts (fixed in v4.3.1)

- Long videos returned only ~10–20 segments. Added `scrollToLoadAllSegments()` and `findScrollableParent()` helpers.

### 2026-02 — View-model component migration (fixed in v4.3.0)

- YouTube migrated transcript segments from Polymer `ytd-transcript-segment-renderer` to `transcript-segment-view-model`. New timestamp class `.ytwTranscriptSegmentViewModelTimestamp`, new text class `.yt-core-attributed-string`. Legacy selectors retained as fallback.

---

## Next-time checklist (when extraction breaks again)

1. **Reproduce in real Chrome** with Distill loaded. Check the YouTube tab's DevTools console for `[Distill]` logs — they pinpoint which step failed.
2. **Try opening the transcript manually.** Did the entry button move, get renamed, or get removed entirely?
3. If the entry point still exists but selectors miss it: inspect the new DOM with `$0` in DevTools after right-click → Inspect, copy a working CSS selector, update `constants.js`.
4. If the entry point moved: enumerate visible UI affordances with a Playwright probe. Template at `/tmp/yte-debug/probe2.js` (or recreate from the v4.3.4 commit history).
5. Inspect the active engagement panel:
   ```js
   Array.from(document.querySelectorAll('ytd-engagement-panel-section-list-renderer'))
     .map(p => ({ target: p.getAttribute('target-id'), vis: p.getAttribute('visibility') }))
   ```
6. Inspect a segment to confirm timestamp/text classes still match:
   ```js
   document.querySelector('transcript-segment-view-model').outerHTML
   ```
7. **Update this doc.** Add a new entry to "Layout Change History" with date, what changed, symptom, fix. Update the "Current Layout" section if selectors moved. Bump CHANGELOG.

---

## Reusable Playwright probe pattern

```js
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await (await browser.newContext({
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ...'
  })).newPage();
  await page.goto('https://www.youtube.com/watch?v=arj7oStGLkU');
  try { await page.click('button[aria-label*="Reject all"]', { timeout: 3000 }); } catch (_) {}
  await page.waitForSelector('ytd-watch-metadata');
  await page.waitForTimeout(3000);

  // Run extraction logic here, log what works/fails
  const result = await page.evaluate(async () => { /* ... */ });
  console.log(result);

  await browser.close();
})();
```

Headless `get_transcript` returns 400 — that's expected and unrelated to extraction logic. Verify segment rendering in real Chrome, not Playwright.

### Trusted Types gotcha

YouTube enforces Trusted Types CSP. `page.addScriptTag({ content: src })` throws `Failed to set 'text' property: This document requires 'TrustedScript' assignment`. Workaround: `await page.evaluate(src => { eval(src); }, src)` — runs the script in the page context without creating a `<script>` element.

### Verification recipe (not just a probe)

To validate a fix end-to-end without loading the extension into Chrome:

1. Read `constants.js` and `content.js` from the repo
2. Strip the `chrome.runtime.onMessage` listener at the bottom of `content.js`, replace with `window.__getTranscript = getTranscript;`
3. Inject both via `page.evaluate(src => { eval(src); }, src)` after YouTube loads
4. Call `await page.evaluate(() => window.__getTranscript())`
5. Watch `[Distill]` console logs to confirm each path step fired

Headless still hits the `get_transcript` 400 — but the path-execution and DOM-selector parts of the fix are fully verifiable this way. Reference implementation: `/tmp/yte-debug/verify.js` from the v4.3.5 session.
