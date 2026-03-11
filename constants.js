// Shared constants for Distill
// Loaded first in manifest before all other content scripts

const YTE_CONSTANTS = {
  // Timing values (ms)
  TOAST_DURATION: 2000,
  TOAST_FADE_OUT: 300,
  MUTATION_TIMEOUT: 3000,
  ERROR_RESET_DELAY: 2000,
  POPUP_CLOSE_DELAY: 500,
  SCRIPT_READY_DELAY: 100,

  // Cache limits
  MAX_CACHED_VIDEOS: 10,
  MAX_CHAT_MESSAGES: 20,

  // API defaults
  DEFAULT_MAX_TOKENS_OPENAI: 4000,
  DEFAULT_MAX_TOKENS_CLAUDE: 4096,
  NANO_MAX_TOKENS: 16384,
  CHAT_CONTEXT_CHAR_LIMIT: 4000,

  // Retry settings
  MAX_RETRIES: 2,
  RETRY_DELAYS: [1000, 2000],
  RETRYABLE_STATUS_CODES: [429, 500, 502, 503, 529],

  // Scroll-to-load settings
  SCROLL_STEP_DELAY: 150,
  SCROLL_MAX_ITERATIONS: 100,

  // YouTube DOM selectors
  SELECTORS: {
    MORE_ACTIONS: [
      'button[aria-label="More actions"]',
      'button[aria-label*="More"]',
      'ytd-menu-renderer button',
      '#button-shape > button[aria-label*="More"]'
    ],
    MENU_ITEMS: 'ytd-menu-service-item-renderer, tp-yt-paper-listbox ytd-menu-service-item-renderer, ytd-menu-popup-renderer ytd-menu-service-item-renderer',
    MENU_POPUP: 'ytd-menu-popup-renderer tp-yt-paper-listbox',
    TRANSCRIPT_SEGMENTS: 'transcript-segment-view-model',
    TRANSCRIPT_SEGMENTS_LEGACY: 'ytd-transcript-segment-renderer',
    SEGMENT_TIMESTAMP: [
      '.ytwTranscriptSegmentViewModelTimestamp',
      '.segment-timestamp',
      '[class*="segment-timestamp"]',
      'div[class*="cue-group"] div[class*="cue"]:first-child'
    ],
    SEGMENT_TEXT: [
      '.yt-core-attributed-string',
      '.segment-text',
      'yt-formatted-string.segment-text',
      '[class*="segment-text"]'
    ],
    VIDEO_TITLE: [
      'h1.ytd-watch-metadata yt-formatted-string',
      'h1.title yt-formatted-string',
      'ytd-watch-metadata h1',
      'h1.ytd-video-primary-info-renderer'
    ],
    SIDEBAR: [
      '#secondary #related',
      'ytd-watch-flexy #secondary #related',
      '#secondary.ytd-watch-flexy'
    ],
    TRANSCRIPT_CONTAINER: [
      'ytd-transcript-search-panel-renderer #body',
      'ytd-transcript-renderer #body',
      'ytd-engagement-panel-section-list-renderer #content',
      'ytd-engagement-panel-section-list-renderer #content #body'
    ],
    TRANSCRIPT_PANEL_CLOSE: [
      'ytd-engagement-panel-section-list-renderer #visibility-button button[aria-label="Close"]',
      'ytd-engagement-panel-section-list-renderer #header button[aria-label="Close"]',
      'ytd-transcript-search-panel-renderer button[aria-label="Close"]'
    ]
  }
};

// Freeze to prevent accidental mutation
Object.freeze(YTE_CONSTANTS);
Object.freeze(YTE_CONSTANTS.SELECTORS);
Object.freeze(YTE_CONSTANTS.RETRY_DELAYS);
Object.freeze(YTE_CONSTANTS.RETRYABLE_STATUS_CODES);
Object.freeze(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_CONTAINER);
Object.freeze(YTE_CONSTANTS.SELECTORS.TRANSCRIPT_PANEL_CLOSE);

window.YTE_CONSTANTS = YTE_CONSTANTS;
