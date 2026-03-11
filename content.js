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

async function getTranscript() {
  try {
    // Get video ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');

    if (!videoId) {
      return { error: 'No video ID found. Please open a YouTube video.' };
    }

    // First, check if transcript is already open (try new selectors, then legacy)
    let transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
    if (transcriptSegments.length === 0) {
      transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
    }

    if (transcriptSegments.length === 0) {
      // Try to open the transcript panel
      let moreActionsButton = null;
      for (const selector of YTE_CONSTANTS.SELECTORS.MORE_ACTIONS) {
        moreActionsButton = document.querySelector(selector);
        if (moreActionsButton) break;
      }

      if (moreActionsButton) {
        moreActionsButton.click();

        // Wait for menu to appear using MutationObserver
        try {
          await waitForElement(YTE_CONSTANTS.SELECTORS.MENU_POPUP);
        } catch (e) {
          // Fallback: wait a fixed time if observer fails
          await new Promise(resolve => setTimeout(resolve, 800));
        }

        // Look for transcript button in the menu
        const menuItems = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.MENU_ITEMS);

        let transcriptButton = null;
        for (const item of menuItems) {
          const text = item.textContent.toLowerCase();
          if (text.includes('transcript') || text.includes('show transcript')) {
            transcriptButton = item;
            break;
          }
        }

        if (transcriptButton) {
          transcriptButton.click();

          // Wait for transcript segments to appear using MutationObserver
          // Try new view model selector first, then legacy
          try {
            await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
          } catch (e) {
            try {
              await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
            } catch (e2) {
              // Fallback: wait a fixed time
              await new Promise(resolve => setTimeout(resolve, 1500));
            }
          }
        } else {
          // Try alternative: look for button directly
          const altTranscriptButton = Array.from(document.querySelectorAll('button, a')).find(
            el => el.textContent.toLowerCase().includes('show transcript')
          );
          if (altTranscriptButton) {
            altTranscriptButton.click();
            try {
              await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
            } catch (e) {
              try {
                await waitForElement(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
              } catch (e2) {
                await new Promise(resolve => setTimeout(resolve, 1500));
              }
            }
          }
        }
      }

      // Check again for transcript segments (new selectors first, then legacy)
      transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS);
      if (transcriptSegments.length === 0) {
        console.warn('[Distill] New selectors found no segments, trying legacy selectors');
        transcriptSegments = document.querySelectorAll(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_SEGMENTS_LEGACY);
      }
    }

    if (transcriptSegments.length === 0) {
      return { error: 'No transcript found. This video may not have captions available, or the transcript UI has changed. Try opening the transcript manually first.' };
    }

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
