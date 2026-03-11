# Implementation Plan: Updated DOM Selector Extraction

**Linear Epic:** [ENG-48] Fix transcript extraction: update DOM selectors
**Target Version:** 4.3.0
**Files Modified:** `content.js`, `constants.js`
**Files Unchanged:** `background.js`, `manifest.json`, `transcript-orchestrator.js`, `modal-ui.js`, `utils.js`

---

## Context

YouTube updated their transcript UI (Feb 2026), breaking the DOM selectors the extension uses for transcript extraction. Users see: *"No transcript found. This video may not have captions available, or the transcript UI has changed."*

### Testing Findings (March 2026)

We tested the original data-based extraction plan in Chrome DevTools on live YouTube videos:

1. **Timedtext API is broken** — `getPlayerResponse()` returns caption tracks with `baseUrl`, but fetching those URLs returns `200` with **empty body** (both JSON3 and XML formats). YouTube appears to have deprecated direct timedtext URL fetching.
2. **InnerTube `get_transcript` API requires auth** — Returns `400 FAILED_PRECONDITION` even with SAPISIDHASH. Content scripts can't easily replicate YouTube's internal auth.
3. **YouTube migrated to view model components** — Transcript segments now use `<transcript-segment-view-model>` elements (not `ytd-transcript-segment-renderer`). Timestamp class: `.ytwTranscriptSegmentViewModelTimestamp`. Text class: `.yt-core-attributed-string`.
4. **Script tag parsing still works** — `captionTracks` exists in script tags on some videos (but not all).
5. **`getPlayerResponse()` works** — Available on `#movie_player` element, returns captions data. But the URLs it provides are non-functional.
6. **DOM extraction with new selectors works** — Successfully extracted 28 segments from a live video using the new view model selectors.

**Conclusion:** The timedtext API approach won't work. The most reliable approach is **updated DOM scraping with new selectors** as primary, with old selectors as fallback.

## Architecture

```
getTranscript(videoId)
  ├── Try 1: New view model selectors (primary)
  │     └── transcript-segment-view-model elements
  │         ├── .ytwTranscriptSegmentViewModelTimestamp → timestamp
  │         └── .yt-core-attributed-string → text
  │
  └── Try 2: Legacy Polymer selectors (fallback)
        └── ytd-transcript-segment-renderer elements
            ├── .segment-timestamp → timestamp
            └── .segment-text → text
```

**Output contract preserved:** `{ success: true, transcript: "[0:00] text\n...", videoId }` — no consumer changes needed.

---

## Task Breakdown

### Task 1: Update Selectors in constants.js — [ENG-49]

**File:** `constants.js`
**Effort:** Small

Update `YTE_CONSTANTS.SELECTORS` with new primary selectors and legacy fallbacks:

```javascript
SELECTORS: {
  // ... existing selectors (MORE_ACTIONS, MENU_ITEMS, etc.) ...
  TRANSCRIPT_SEGMENTS: 'transcript-segment-view-model',  // New primary
  TRANSCRIPT_SEGMENTS_LEGACY: 'ytd-transcript-segment-renderer',  // Old fallback
  SEGMENT_TIMESTAMP: [
    '.ytwTranscriptSegmentViewModelTimestamp',  // New primary
    '.segment-timestamp',  // Legacy
    '[class*="segment-timestamp"]',
    'div[class*="cue-group"] div[class*="cue"]:first-child'
  ],
  SEGMENT_TEXT: [
    '.yt-core-attributed-string',  // New primary
    '.segment-text',  // Legacy
    'yt-formatted-string.segment-text',
    '[class*="segment-text"]'
  ],
}
```

**Notes:**
- No CAPTIONS config needed (timedtext API non-functional)
- New selectors go first in arrays for priority
- Legacy selectors kept for older YouTube UI versions

---

### Task 2: Update getTranscript() in content.js — [ENG-53]

**File:** `content.js`
**Effort:** Medium
**Depends on:** ENG-49

After opening the transcript panel, try new selectors first, then fall back to legacy:

```javascript
// After transcript panel is open...

// Try new view model selectors first
let segments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);

// Fall back to legacy selectors
if (!segments || segments.length === 0) {
  console.warn('[Distill] New selectors found no segments, trying legacy selectors');
  segments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
}

if (!segments || segments.length === 0) {
  return { error: 'No transcript segments found.' };
}

// Extract timestamp and text from each segment
// Selector arrays in SEGMENT_TIMESTAMP and SEGMENT_TEXT handle fallback order automatically
```

**Key points:**
- The "open transcript panel" DOM interaction flow is unchanged (still needed to trigger lazy-load)
- Selector arrays for timestamp/text already handle fallback order via `querySelector` iteration
- No two-phase architecture — single DOM extraction with selector fallback
- No changes to `transcript-orchestrator.js` or any other consumer

---

### Task 3: Manual Testing & Verification — [ENG-54]

**Effort:** Medium
**Depends on:** ENG-49, ENG-53

**Critical tests before shipping:**
1. New selectors extract transcript on fresh page load
2. New selectors extract transcript after SPA navigation
3. Legacy fallback works when new selectors fail (simulate by temporarily changing primary selector)
4. AI summary + chat still work with extracted transcript
5. Caching works correctly
6. Both entry points (FAB + popup) work
7. `[timestamp] text` format preserved

**Test video types:**
- Video with manual captions (TED Talk)
- Video with auto-generated captions (vlog)
- Long video (1hr+) — verify `[H:MM:SS]` format
- Video with no captions — verify error message

**Version bump checklist:**
- [ ] `manifest.json` → version `4.3.0`
- [ ] `CLAUDE.md` → update version, version history, architecture notes
- [ ] `CHANGELOG.md` → add v4.3.0 entry
- [ ] `README.md` → update if user-facing changes

---

## Closed Issues (Won't Do)

The following tasks from the original plan are **closed as won't-do** based on testing findings:

- **ENG-50** (`_getPlayerResponse()`): Timedtext URLs return empty responses — player response data is available but not useful
- **ENG-51** (`_selectCaptionTrack()`): No caption track selection needed since we're not fetching timedtext
- **ENG-52** (Timed text fetch & parse): Timedtext API non-functional — returns 200 with empty body

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| YouTube changes view model selectors again | Medium | Legacy selectors as fallback. Selector arrays easy to update in constants.js. |
| Some videos still use old Polymer selectors | Low | Legacy fallback covers this case. |
| Transcript panel DOM interaction breaks | Medium | MutationObserver + fixed delay fallbacks already handle timing issues. |

---

## Rollback Plan

If the selector updates cause issues:
1. Revert `constants.js` and `content.js` to v4.2.1
2. No database migrations or infrastructure changes to undo
