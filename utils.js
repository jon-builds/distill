// Utility functions for Distill
// Shared across all content scripts

class Utils {
  /**
   * Extract video ID from YouTube URL
   * @param {string} url - YouTube URL (full or relative)
   * @returns {string|null} - Video ID or null if not found
   */
  static extractVideoId(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.searchParams.get('v');
    } catch (e) {
      // Fallback for relative URLs
      const match = url.match(/[?&]v=([^&]+)/);
      return match ? match[1] : null;
    }
  }

  /**
   * Get current video ID from window location
   * @returns {string|null} - Video ID or null
   */
  static getCurrentVideoId() {
    return this.extractVideoId(window.location.href);
  }

  /**
   * Check if extension context is still valid
   * Returns false if extension was reloaded and page needs refresh
   * @returns {boolean} - True if context is valid
   */
  static isExtensionContextValid() {
    try {
      // Try to access chrome.runtime.id
      // This will throw if context is invalidated
      return !!chrome.runtime?.id;
    } catch (e) {
      return false;
    }
  }

  /**
   * Check if Chrome extension APIs are available
   * @returns {boolean} - True if APIs are available
   */
  static isChromeAPIAvailable() {
    try {
      return !!(chrome && chrome.runtime && chrome.runtime.id);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if error is "Extension context invalidated"
   * @param {Error} error - Error object
   * @returns {boolean} - True if context invalidated error
   */
  static isContextInvalidatedError(error) {
    const message = error?.message || error?.toString() || '';
    return message.includes('Extension context invalidated') ||
           message.includes('Cannot read properties of undefined') ||
           !Utils.isChromeAPIAvailable();
  }

  /**
   * Format seconds to timestamp (MM:SS or HH:MM:SS)
   * @param {number} seconds - Time in seconds
   * @returns {string} - Formatted timestamp
   */
  static formatTimestamp(seconds) {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} text - Text to escape
   * @returns {string} - Escaped HTML
   */
  static escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} - Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Simple markdown to HTML converter
   * Supports: headers, bold, italic, lists, code blocks
   * @param {string} text - Markdown text
   * @returns {string} - HTML string
   */
  static markdownToHtml(text) {
    let html = text;

    // Escape HTML to prevent XSS
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // Helper function to apply inline formatting
    const applyInlineFormatting = (str) => {
      str = str.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
      str = str.replace(/\*(.+?)\*/g, '<em>$1</em>');
      str = str.replace(/`(.+?)`/g, '<code>$1</code>');
      return str;
    };

    // Split into lines for better processing
    const lines = html.split('\n');
    const processed = [];
    let inList = false;
    let listType = null;
    let inCodeBlock = false;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i];

      // Code blocks
      if (line.trim().startsWith('```')) {
        if (inCodeBlock) {
          processed.push('</code></pre>');
          inCodeBlock = false;
        } else {
          processed.push('<pre><code>');
          inCodeBlock = true;
        }
        continue;
      }

      if (inCodeBlock) {
        processed.push(line);
        continue;
      }

      // Check for list items
      const unorderedMatch = line.match(/^\s*[\*\-]\s+(.+)$/);
      const orderedMatch = line.match(/^\s*\d+\.\s+(.+)$/);

      if (unorderedMatch || orderedMatch) {
        let content = unorderedMatch ? unorderedMatch[1] : orderedMatch[1];
        const currentListType = unorderedMatch ? 'ul' : 'ol';

        // Apply inline formatting to list item content
        content = applyInlineFormatting(content);

        if (!inList) {
          processed.push(`<${currentListType}>`);
          inList = true;
          listType = currentListType;
        } else if (listType !== currentListType) {
          processed.push(`</${listType}>`);
          processed.push(`<${currentListType}>`);
          listType = currentListType;
        }

        processed.push(`<li>${content}</li>`);
        continue;
      } else if (inList) {
        processed.push(`</${listType}>`);
        inList = false;
        listType = null;
      }

      // Headers
      if (line.startsWith('### ')) {
        processed.push(`<h3>${applyInlineFormatting(line.substring(4))}</h3>`);
        continue;
      } else if (line.startsWith('## ')) {
        processed.push(`<h2>${applyInlineFormatting(line.substring(3))}</h2>`);
        continue;
      } else if (line.startsWith('# ')) {
        processed.push(`<h1>${applyInlineFormatting(line.substring(2))}</h1>`);
        continue;
      }

      // Inline formatting (bold, italic, code)
      line = applyInlineFormatting(line);

      // Empty lines become <br>
      if (line.trim() === '') {
        processed.push('<br>');
      } else {
        processed.push(line);
      }
    }

    // Close any open lists
    if (inList) {
      processed.push(`</${listType}>`);
    }

    // Close any open code blocks
    if (inCodeBlock) {
      processed.push('</code></pre>');
    }

    return processed.join('\n');
  }

  /**
   * Check if device is desktop (not mobile)
   * @returns {boolean} - True if desktop
   */
  static isDesktop() {
    return window.innerWidth >= 1024 && !navigator.userAgent.includes('Mobile');
  }

  /**
   * Check if current page is a YouTube video page
   * @returns {boolean} - True if on /watch?v= page
   */
  static isVideoPage() {
    return window.location.pathname === '/watch' &&
           new URLSearchParams(window.location.search).has('v');
  }

  /**
   * Get video title from YouTube DOM
   * @returns {string} - Video title or 'Unknown Video'
   */
  static getVideoTitle() {
    const selectors = typeof YTE_CONSTANTS !== 'undefined'
      ? YTE_CONSTANTS.SELECTORS.VIDEO_TITLE
      : [
        'h1.ytd-watch-metadata yt-formatted-string',
        'h1.title yt-formatted-string',
        'ytd-watch-metadata h1',
        'h1.ytd-video-primary-info-renderer'
      ];

    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (el && el.textContent) {
        return el.textContent.trim();
      }
    }

    return 'Unknown Video';
  }

  /**
   * Parse transcript segments from raw text
   * @param {string} rawTranscript - Raw transcript with [timestamp] prefix
   * @returns {Array} - Array of {timestamp, text} objects
   */
  static parseSegments(rawTranscript) {
    const lines = rawTranscript.split('\n');
    const segments = [];

    for (const line of lines) {
      const match = line.match(/^\[([^\]]+)\]\s*(.+)$/);
      if (match) {
        segments.push({
          timestamp: match[1],
          text: match[2]
        });
      } else if (line.trim()) {
        segments.push({
          timestamp: '',
          text: line.trim()
        });
      }
    }

    return segments;
  }

  /**
   * Copy text to clipboard with rich text support
   * Copies both plain text and HTML formats for better paste compatibility
   * @param {string} plainText - Plain text version
   * @param {string} html - HTML version (optional, if not provided uses plainText)
   * @returns {Promise<void>}
   */
  static async copyRichText(plainText, html = null) {
    try {
      // If no HTML provided, use plain text for both formats
      if (!html) {
        html = plainText.replace(/\n/g, '<br>');
      }

      // Wrap HTML in proper structure for rich editors
      const styledHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; color: #000;">
          ${html}
        </div>
      `;

      // Create clipboard items with both formats
      const clipboardItem = new ClipboardItem({
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
        'text/html': new Blob([styledHtml], { type: 'text/html' })
      });

      await navigator.clipboard.write([clipboardItem]);
    } catch (err) {
      // Fallback to plain text if rich text fails
      console.warn('[Utils] Rich text copy failed, falling back to plain text:', err);
      await navigator.clipboard.writeText(plainText);
    }
  }

  /**
   * Log error with context
   * @param {string} context - Error context (e.g., 'CacheManager', 'ModalUI')
   * @param {Error|string} error - Error object or message
   * @param {Object} metadata - Additional metadata
   */
  static logError(context, error, metadata = {}) {
    // Extract error details
    const errorMessage = error?.message || error?.toString() || String(error);
    const errorStack = error?.stack || 'No stack trace available';
    const errorName = error?.name || 'Error';

    // Build detailed error info
    const errorDetails = {
      timestamp: new Date().toISOString(),
      context: context,
      name: errorName,
      message: errorMessage,
      stack: errorStack,
      metadata: metadata,
      userAgent: navigator.userAgent,
      url: window.location.href
    };

    // Log with clear formatting
    console.error(`[YTE Error - ${context}]`, errorMessage);
    console.error('Error Details:', errorDetails);

    // If error has additional properties, log them
    if (error && typeof error === 'object') {
      const additionalProps = {};
      for (const key in error) {
        if (error.hasOwnProperty(key) && !['message', 'stack', 'name'].includes(key)) {
          additionalProps[key] = error[key];
        }
      }
      if (Object.keys(additionalProps).length > 0) {
        console.error('Additional Error Properties:', additionalProps);
      }
    }
  }
}

// Export to window for global access in content scripts
window.Utils = Utils;
