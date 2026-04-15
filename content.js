// Content script that runs on YouTube pages
// This script extracts transcript data from the YouTube page

/**
 * Wait for an element matching selector to appear in the DOM
 * @param {string} selector - CSS selector
 * @param {number} timeout - Max wait time in ms
 * @returns {Promise<Element>} - Resolved when element appears
 */
function waitForElement(selector, timeout = YTE_CONSTANTS.MUTATION_TIMEOUT) {
  return new Promise((resolve, reject) => {
    // Check if element already exists
    const existing = document.querySelector(selector);
    if (existing) {
      resolve(existing);
      return;
    }

    const observer = new MutationObserver(() => {
      const el = document.querySelector(selector);
      if (el) {
        observer.disconnect();
        clearTimeout(timer);
        resolve(el);
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });

    const timer = setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for ${selector}`));
    }, timeout);
  });
}

/**
 * Walk up the DOM to find the nearest scrollable ancestor
 * @param {Element} element - Starting element
 * @returns {Element|null} - Scrollable parent or null
 */
function findScrollableParent(element) {
  let current = element.parentElement;
  while (current && current !== document.body) {
    const style = window.getComputedStyle(current);
    const overflowY = style.overflowY;
    if ((overflowY === 'auto' || overflowY === 'scroll') && current.scrollHeight > current.clientHeight) {
      return current;
    }
    current = current.parentElement;
  }
  return null;
}

/**
 * Scroll through the transcript container to load all virtualized segments
 * @param {Element} container - Scrollable container element
 * @param {string} segmentSelector - CSS selector for transcript segments
 * @returns {Promise<void>}
 */
async function scrollToLoadAllSegments(container, segmentSelector) {
  let previousCount = 0;
  let stableChecks = 0;

  for (let i = 0; i < YTE_CONSTANTS.SCROLL_MAX_ITERATIONS; i++) {
    // Scroll down by one viewport height
    container.scrollTop += container.clientHeight;

    await new Promise(resolve => setTimeout(resolve, YTE_CONSTANTS.SCROLL_STEP_DELAY));

    const currentCount = document.querySelectorAll(segmentSelector).length;

    if (currentCount === previousCount) {
      stableChecks++;
      if (stableChecks >= 2) {
        // Count hasn't changed for 2 consecutive checks — all segments loaded
        break;
      }
    } else {
      stableChecks = 0;
    }

    previousCount = currentCount;
  }
}

/**
 * Wait for transcript segments (new view-model selector, then legacy) then settle
 */
async function waitForSegmentsAndSettle() {
  try {
    await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
  } catch (e) {
    try {
      await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
    } catch (e2) {
      await new Promise(resolve => setTimeout(resolve, 1500));
    }
  }
  // Settle delay: let the transcript panel finish layout before scroll-container detection
  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Primary path (as of 2026-04-15): expand the video description ("...more")
 * and click the inline "Show transcript" button it reveals.
 * See docs/youtube-dom-layout.md for current layout reference.
 * @returns {Promise<boolean>} true if the path was taken successfully
 */
async function tryDescriptionExpanderPath() {
  let expandButton = null;
  for (const selector of YTE_CONSTANTS.SELECTORS.DESCRIPTION_EXPAND) {
    expandButton = document.querySelector(selector);
    if (expandButton) {
      console.log(`[Distill] Description expand matched selector: ${selector}`);
      break;
    }
  }
  if (!expandButton) {
    console.log('[Distill] Description expand button not found');
    return false;
  }

  expandButton.click();

  // Wait for the inline "Show transcript" button to appear
  try {
    await waitForElement(YTE_CONSTANTS.SELECTORS.SHOW_TRANSCRIPT_BUTTON[0], 2000);
  } catch (e) {
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  let showButton = null;
  for (const selector of YTE_CONSTANTS.SELECTORS.SHOW_TRANSCRIPT_BUTTON) {
    const candidates = document.querySelectorAll(selector);
    for (const candidate of candidates) {
      if (candidate.offsetParent !== null) {
        showButton = candidate;
        console.log(`[Distill] Show transcript button matched selector: ${selector}`);
        break;
      }
    }
    if (showButton) break;
  }
  if (!showButton) {
    console.log('[Distill] Show transcript button not visible after description expand');
    return false;
  }

  showButton.click();
  console.log('[Distill] Panel opened via description expander path');
  await waitForSegmentsAndSettle();
  return true;
}

/**
 * Fallback path: per-video "More actions" (3-dot) menu → "Show transcript" item.
 * Worked until 2026-04-15 — kept in case YouTube re-adds the item to some videos/regions.
 * @returns {Promise<boolean>} true if the path was taken successfully
 */
async function tryMenuPath() {
  let moreActionsButton = null;
  for (const selector of YTE_CONSTANTS.SELECTORS.MORE_ACTIONS) {
    moreActionsButton = document.querySelector(selector);
    if (moreActionsButton) {
      console.log(`[Distill] More actions button matched selector: ${selector}`);
      break;
    }
  }
  if (!moreActionsButton) {
    console.log('[Distill] More actions button not found');
    return false;
  }

  moreActionsButton.click();

  try {
    await waitForElement(YTE_CONSTANTS.SELECTORS.MENU_POPUP);
  } catch (e) {
    await new Promise(resolve => setTimeout(resolve, 800));
  }

  const menuItems = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.MENU_ITEMS);
  console.log(`[Distill] Menu items found: ${menuItems.length}`);

  let transcriptButton = null;
  for (const item of menuItems) {
    const text = item.textContent.toLowerCase();
    if (text.includes('transcript') || text.includes('show transcript')) {
      transcriptButton = item;
      console.log('[Distill] Transcript button found in menu');
      break;
    }
  }

  if (!transcriptButton) {
    console.log('[Distill] No transcript item in More actions menu');
    return false;
  }

  transcriptButton.click();
  console.log('[Distill] Panel opened via menu path');
  await waitForSegmentsAndSettle();
  return true;
}

async function getTranscript() {
  try {
    // Get video ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    if (!videoId) {
      return { error: 'No video ID found. Please open a YouTube video.' };
    }

    // Track whether we opened the transcript panel (to close it later)
    let weOpenedPanel = false;

    // First, check if transcript is already open (try new selectors, then legacy)
    let transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
    if (transcriptSegments.length === 0) {
      transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
    }

    if (transcriptSegments.length === 0) {
      // Try description-expander path first (current YouTube layout), fall back to menu path
      const opened = await tryDescriptionExpanderPath() || await tryMenuPath();
      weOpenedPanel = opened;

      // Re-query segments
      transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
      console.log(`[Distill] Segments after panel open (new selectors): ${transcriptSegments.length}`);
      if (transcriptSegments.length === 0) {
        console.warn('[Distill] New selectors found no segments, trying legacy selectors');
        transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
        console.log(`[Distill] Segments after panel open (legacy selectors): ${transcriptSegments.length}`);
      }
    }

    if (transcriptSegments.length === 0) {
      return { error: 'No transcript found. This video may not have captions available, or the transcript UI has changed. Try opening the transcript manually first.' };
    }

    // Scroll to load all virtualized segments
    const activeSelector = document.querySelector(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS)
      ? YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS
      : YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY;

    const firstSegment = document.querySelector(activeSelector);
    let scrollContainer = null;

    // Try known container selectors first
    for (const selector of YTE_CONSTANTS.SELECTORS.TRANSCRIPT_CONTAINER) {
      const candidate = document.querySelector(selector);
      if (candidate && candidate.scrollHeight > candidate.clientHeight) {
        scrollContainer = candidate;
        console.log(`[Distill] Scroll container matched selector: ${selector} (scrollHeight=${candidate.scrollHeight}, clientHeight=${candidate.clientHeight})`);
        break;
      }
    }

    // Fall back to walking up from first segment
    if (!scrollContainer && firstSegment) {
      scrollContainer = findScrollableParent(firstSegment);
      if (scrollContainer) {
        console.log(`[Distill] Scroll container found via DOM walk: ${scrollContainer.tagName}#${scrollContainer.id || '(no id)'}`);
      }
    }

    if (!scrollContainer) {
      console.warn('[Distill] No scroll container found — scroll-to-load will be skipped');
    }

    if (scrollContainer) {
      await scrollToLoadAllSegments(scrollContainer, activeSelector);
      // Scroll back to top before extraction
      scrollContainer.scrollTop = 0;
      await new Promise(resolve => setTimeout(resolve, YTE_CONSTANTS.SCROLL_STEP_DELAY));
      // Re-query segments after scroll-to-load
      transcriptSegments = document.querySelectorAll(activeSelector);
      console.log(`[Distill] Segments after scroll-to-load: ${transcriptSegments.length}`);
    }

    console.log(`[Distill] Final segment count for extraction: ${transcriptSegments.length}`);
    let transcriptText = '';

    transcriptSegments.forEach(segment => {
      // Try multiple selectors for timestamp
      let timestampElement = null;
      for (const selector of YTE_CONSTANTS.SELECTORS.SEGMENT_TIMESTAMP) {
        timestampElement = segment.querySelector(selector);
        if (timestampElement) break;
      }

      // Try multiple selectors for text
      let textElement = null;
      for (const selector of YTE_CONSTANTS.SELECTORS.SEGMENT_TEXT) {
        textElement = segment.querySelector(selector);
        if (textElement) break;
      }

      if (textElement) {
        const timestamp = timestampElement ? timestampElement.textContent.trim() : '';
        const text = textElement.textContent.trim();

        if (timestamp) {
          transcriptText += `[${timestamp}] ${text}\n`;
        } else {
          transcriptText += `${text}\n`;
        }
      }
    });

    if (!transcriptText.trim()) {
      return { error: 'Transcript panel found but could not extract text. Please try again.' };
    }

    // Close the transcript panel if we opened it
    if (weOpenedPanel) {
      for (const selector of YTE_CONSTANTS.SELECTORS.TRANSCRIPT_PANEL_CLOSE) {
        const closeButton = document.querySelector(selector);
        if (closeButton) {
          closeButton.click();
          break;
        }
      }
    }

    return {
      success: true,
      transcript: transcriptText.trim(),
      videoId: videoId
    };

  } catch (error) {
    return { error: `Error extracting transcript: ${error.message}` };
  }
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getTranscript') {
    getTranscript().then(result => {
      sendResponse(result);
    });
    return true; // Keep the message channel open for async response
  }
});
