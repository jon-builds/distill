// Background service worker for handling API calls
// This bypasses CORS restrictions that would occur in popup/settings pages

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'fetchOpenAIModels') {
    fetchOpenAIModels(request.apiKey)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async response
  }

  if (request.action === 'fetchClaudeModels') {
    fetchClaudeModels(request.apiKey)
      .then(sendResponse)
      .catch(error => sendResponse({ error: error.message }));
    return true; // Required for async response
  }

  if (request.action === 'callOpenAI') {
    console.log('[Background] callOpenAI message received:', {
      model: request.model,
      apiKeyLength: request.apiKey?.length,
      hasPrompt: !!request.prompt,
      hasTranscript: !!request.transcript
    });
    callOpenAI(request.apiKey, request.model, request.prompt, request.transcript)
      .then(result => {
        console.log('[Background] callOpenAI success');
        sendResponse({ success: true, result });
      })
      .catch(error => {
        console.error('[Background] callOpenAI error:', error.message);
        sendResponse({ success: false, error: error.message });
      });
    return true; // Required for async response
  }

  if (request.action === 'callClaude') {
    console.log('callClaude message received:', {
      apiKeyLength: request.apiKey?.length,
      apiKeyPrefix: request.apiKey?.substring(0, 10),
      model: request.model,
      hasPrompt: !!request.prompt,
      hasTranscript: !!request.transcript
    });
    callClaude(request.apiKey, request.model, request.prompt, request.transcript)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true; // Required for async response
  }

  // Chat handlers (multi-turn conversation)
  if (request.action === 'chatOpenAI') {
    console.log('[Background] chatOpenAI:', { model: request.model, messageCount: request.messages?.length });
    chatOpenAI(request.apiKey, request.model, request.messages)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'chatClaude') {
    console.log('[Background] chatClaude:', { model: request.model, messageCount: request.messages?.length });
    chatClaude(request.apiKey, request.model, request.messages, request.system)
      .then(result => sendResponse({ success: true, result }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }

  if (request.action === 'openSettings') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('settings.html')
    }, (tab) => {
      sendResponse({ success: true, tabId: tab.id });
    });
    return true; // Required for async response
  }
});

/**
 * Format OpenAI model ID into user-friendly label
 * Optimized for recommended models used in short text summaries
 * @param {string} modelId - Raw model ID from OpenAI
 * @returns {string} - Formatted label
 */
function formatModelLabel(modelId) {
  // Map of recommended model IDs to friendly names
  const labelMap = {
    // ChatGPT-4o family (best quality)
    'chatgpt-4o-latest': 'ChatGPT-4o Latest (Best Quality)',
    'gpt-4o': 'GPT-4o',
    'gpt-4o-mini': 'GPT-4o Mini',

    // GPT-5 family (frontier models, ultra-affordable)
    'gpt-5': 'GPT-5 (Frontier)',
    'gpt-5-nano': 'GPT-5 Nano (Ultra Cheap)',
    'gpt-5-mini': 'GPT-5 Mini'
  };

  // Return mapped label or clean up the ID
  if (labelMap[modelId]) {
    return labelMap[modelId];
  }

  // Fallback: clean up the model ID for display
  return modelId
    .replace(/^gpt-5-/i, 'GPT-5 ')
    .replace(/^gpt-4o-/i, 'GPT-4o ')
    .replace(/^gpt-/i, 'GPT-')
    .replace(/^chatgpt-/i, 'ChatGPT-')
    .replace(/-turbo/i, ' Turbo')
    .replace(/-mini/i, ' Mini')
    .replace(/-nano/i, ' Nano');
}

async function fetchOpenAIModels(apiKey) {
  if (!apiKey || apiKey.trim() === '') {
    return { success: false, models: null };
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      if (response.status === 401) {
        return { success: false, models: null, error: 'Invalid API key' };
      }
      throw new Error(`Failed to fetch models: ${response.status}`);
    }

    const data = await response.json();

    if (!data.data || !Array.isArray(data.data)) {
      return { success: false, models: null, error: 'Unexpected response format' };
    }

    // Curated list of models optimized for short text summaries
    // Only the most relevant and cost-effective models
    const recommendedModels = [
      'chatgpt-4o-latest',    // Latest ChatGPT-4o (best quality)
      'gpt-4o',               // GPT-4o (fast, high quality)
      'gpt-4o-mini',          // GPT-4o Mini (balanced)
      'gpt-5',                // GPT-5 (base frontier model)
      'gpt-5-nano',           // GPT-5 Nano (frontier, ultra-cheap)
      'gpt-5-mini',           // GPT-5 Mini (frontier)
    ];

    // Filter for recommended models only
    const chatModels = data.data
      .filter(model => {
        const id = model.id.toLowerCase();

        // Only include exact matches from recommended list
        // This prevents snapshot models like gpt-4o-2024-11-20 from appearing
        return recommendedModels.some(recommended =>
          id === recommended.toLowerCase()
        );
      })
      .sort((a, b) => {
        // Sort by priority order in recommendedModels list
        const getPriority = (id) => {
          const index = recommendedModels.findIndex(recommended =>
            id.toLowerCase().startsWith(recommended.toLowerCase())
          );
          return index === -1 ? 999 : index;
        };

        return getPriority(a.id) - getPriority(b.id);
      })
      .map(model => ({
        value: model.id,
        label: formatModelLabel(model.id)
      }));

    if (chatModels.length === 0) {
      console.warn('[OpenAI Models] No chat models found. Total models fetched:', data.data.length);
      return { success: false, models: null, error: 'No chat models found' };
    }

    console.log('[OpenAI Models] Found', chatModels.length, 'chat models:', chatModels.map(m => m.value).join(', '));
    return { success: true, models: chatModels };
  } catch (error) {
    return { success: false, models: null, error: error.message };
  }
}

async function fetchClaudeModels(apiKey) {
  const fallbackModels = [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6 (Latest)' },
    { value: 'claude-sonnet-4-6', label: 'Claude Sonnet 4.6 (Latest)' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
    { value: 'claude-opus-4-5-20251101', label: 'Claude Opus 4.5' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-opus-4-20250514', label: 'Claude Opus 4' }
  ];

  if (!apiKey || apiKey.trim() === '') {
    return { success: true, models: fallbackModels };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/models?limit=100', {
      method: 'GET',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      }
    });

    if (response.status === 401) {
      return { success: false, models: null, error: 'Invalid API key' };
    }

    if (!response.ok) {
      console.warn('[Claude API] Models endpoint failed, using fallback list');
      return { success: true, models: fallbackModels };
    }

    const data = await response.json();
    const models = data.data
      .filter(m => m.id.startsWith('claude-'))
      .map(m => ({ value: m.id, label: m.display_name }));

    if (models.length === 0) {
      return { success: true, models: fallbackModels };
    }

    console.log('[Claude API] Fetched models:', models.map(m => m.value));
    return { success: true, models };
  } catch (error) {
    console.warn('[Claude API] Models fetch error, using fallback list:', error.message);
    return { success: true, models: fallbackModels };
  }
}

/**
 * Build OpenAI request headers
 * @param {string} apiKey - OpenAI API key
 * @returns {Object} - Headers object
 */
function _buildOpenAIHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };
}

/**
 * Build Claude request headers
 * @param {string} apiKey - Claude API key
 * @returns {Object} - Headers object
 */
function _buildClaudeHeaders(apiKey) {
  return {
    'Content-Type': 'application/json',
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true'
  };
}

/**
 * Build OpenAI request body with model-specific parameters
 * @param {string} model - Model ID
 * @param {Array} messages - Messages array
 * @param {Object} options - Additional options (e.g. stream)
 * @returns {Object} - Request body
 */
function _buildOpenAIRequestBody(model, messages, options = {}) {
  const modelLower = model.toLowerCase();

  const isLegacyModel =
    modelLower.startsWith('gpt-3.5') ||
    (modelLower.startsWith('gpt-4') && !modelLower.includes('4o'));

  const noTemperatureSupport =
    modelLower.includes('o1') ||
    modelLower.startsWith('gpt-5');

  const usesMaxCompletionTokens = !isLegacyModel;

  // Model-specific token limits (reasoning models need headroom for reasoning + output)
  const maxTokens = modelLower === 'gpt-5-nano' ? 16384 : 4000;

  const requestBody = {
    model: model,
    messages: messages,
    ...options
  };

  if (!noTemperatureSupport) {
    requestBody.temperature = 0.7;
  }

  if (usesMaxCompletionTokens) {
    requestBody.max_completion_tokens = maxTokens;
  } else {
    requestBody.max_tokens = maxTokens;
  }

  console.log(`[OpenAI API] Model: ${model}, Legacy: ${isLegacyModel}, Temperature: ${!noTemperatureSupport}, max_tokens: ${maxTokens}`);

  return requestBody;
}

/**
 * Fetch with retry for transient errors
 * @param {string} url - Request URL
 * @param {Object} fetchOptions - fetch() options
 * @param {number} maxRetries - Max retries
 * @param {number[]} retryDelays - Delays between retries in ms
 * @returns {Promise<Response>} - Fetch response
 */
async function fetchWithRetry(url, fetchOptions, maxRetries = 2, retryDelays = [1000, 2000]) {
  const retryableStatusCodes = [429, 500, 502, 503, 529];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, fetchOptions);

    if (response.ok || !retryableStatusCodes.includes(response.status)) {
      return response;
    }

    if (attempt < maxRetries) {
      const delay = retryDelays[attempt] || retryDelays[retryDelays.length - 1];
      console.warn(`[API Retry] Status ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
      await new Promise(resolve => setTimeout(resolve, delay));
    } else {
      return response;
    }
  }
}

async function callOpenAI(apiKey, model, prompt, transcript) {
  const messages = [
    { role: 'user', content: prompt + '\n\n' + transcript }
  ];

  const requestBody = _buildOpenAIRequestBody(model, messages);

  const response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: _buildOpenAIHeaders(apiKey),
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.message || `OpenAI API error: ${response.status} ${response.statusText}`;
    console.error(`[OpenAI API Error] Model: ${model}, Status: ${response.status}, Error: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const data = await response.json();

  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error('Invalid response format from OpenAI API');
  }

  const content = data.choices[0].message.content;
  if (!content) {
    const finishReason = data.choices[0].finish_reason || 'unknown';
    console.warn(`[OpenAI API] Empty content from model ${model}, finish_reason: ${finishReason}`);
    throw new Error(`Model returned empty response (finish_reason: ${finishReason}). Try a different model or increase token limit.`);
  }

  return content;
}

async function callClaude(apiKey, model, prompt, transcript) {
  console.log('[Claude API] callClaude:', { model, promptLength: prompt?.length, transcriptLength: transcript?.length });

  const response = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: _buildClaudeHeaders(apiKey),
      body: JSON.stringify({
        model: model,
        max_tokens: 4096,
        messages: [
          { role: 'user', content: prompt + '\n\n' + transcript }
        ]
      })
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.type
      ? `${errorData.error.type}: ${errorData.error.message || response.statusText}`
      : (errorData.error?.message || `Claude API error: ${response.status} ${response.statusText}`);
    console.error(`[Claude API Error] Model: ${model}, Status: ${response.status}, Error: ${errorMsg}`);
    throw new Error(errorMsg);
  }

  const data = await response.json();

  if (!data.content || !data.content[0] || !data.content[0].text) {
    throw new Error('Invalid response format from Claude API');
  }

  return data.content[0].text;
}

// === Chat functions (multi-turn) ===

async function chatOpenAI(apiKey, model, messages) {
  const requestBody = _buildOpenAIRequestBody(model, messages);

  const response = await fetchWithRetry(
    'https://api.openai.com/v1/chat/completions',
    {
      method: 'POST',
      headers: _buildOpenAIHeaders(apiKey),
      body: JSON.stringify(requestBody)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error?.message || `OpenAI API error: ${response.status}`);
  }

  const data = await response.json();
  if (!data.choices?.[0]?.message) {
    throw new Error('Invalid response format from OpenAI API');
  }

  const content = data.choices[0].message.content;
  if (!content) {
    const finishReason = data.choices[0].finish_reason || 'unknown';
    throw new Error(`Model returned empty response (finish_reason: ${finishReason}). Try a different model or increase token limit.`);
  }

  return content;
}

async function chatClaude(apiKey, model, messages, system) {
  const body = {
    model: model,
    max_tokens: 4096,
    messages: messages
  };

  if (system) {
    body.system = system;
  }

  const response = await fetchWithRetry(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: _buildClaudeHeaders(apiKey),
      body: JSON.stringify(body)
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData.error?.type
      ? `${errorData.error.type}: ${errorData.error.message}`
      : (errorData.error?.message || `Claude API error: ${response.status}`);
    throw new Error(errorMsg);
  }

  const data = await response.json();
  if (!data.content?.[0]?.text) {
    throw new Error('Invalid response format from Claude API');
  }

  return data.content[0].text;
}

// === Streaming port handlers ===

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'streamOpenAI') {
    port.onMessage.addListener(async (request) => {
      try {
        const messages = [
          { role: 'user', content: request.prompt + '\n\n' + request.transcript }
        ];

        const requestBody = _buildOpenAIRequestBody(request.model, messages, { stream: true });

        const response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: _buildOpenAIHeaders(request.apiKey),
          body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          port.postMessage({ type: 'error', error: errorData.error?.message || `OpenAI API error: ${response.status}` });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);
            if (data === '[DONE]') continue;

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta;
              const content = delta?.content || delta?.reasoning_content;
              if (content) {
                port.postMessage({ type: 'chunk', content });
              }
            } catch (e) {
              // Skip malformed SSE chunks
            }
          }
        }

        port.postMessage({ type: 'done' });
      } catch (error) {
        try {
          port.postMessage({ type: 'error', error: error.message });
        } catch (e) {
          // Port may be disconnected
        }
      }
    });
  }

  if (port.name === 'streamClaude') {
    port.onMessage.addListener(async (request) => {
      try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: _buildClaudeHeaders(request.apiKey),
          body: JSON.stringify({
            model: request.model,
            max_tokens: 4096,
            stream: true,
            messages: [
              { role: 'user', content: request.prompt + '\n\n' + request.transcript }
            ]
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMsg = errorData.error?.message || `Claude API error: ${response.status}`;
          port.postMessage({ type: 'error', error: errorMsg });
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith('data: ')) continue;
            const data = trimmed.slice(6);

            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
                port.postMessage({ type: 'chunk', content: parsed.delta.text });
              }
            } catch (e) {
              // Skip malformed SSE chunks
            }
          }
        }

        port.postMessage({ type: 'done' });
      } catch (error) {
        try {
          port.postMessage({ type: 'error', error: error.message });
        } catch (e) {
          // Port may be disconnected
        }
      }
    });
  }
});
