const AppError = require('../errors/AppError');
const { createTranscriptCacheKey } = require('../cache/transcriptCache');
const { normalizeTranscript } = require('../utils/transcript');

const RETRYABLE_STATUSES = new Set([500, 503]);

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function safeStatus(body) {
  return typeof body?.search_metadata?.status === 'string' ? body.search_metadata.status : null;
}

function classifyHttpError(status) {
  if (status === 401 || status === 403) {
    return new AppError('TRANSCRIPT_SERVICE_CONFIGURATION_ERROR', 'The transcript service is temporarily unavailable.', 503);
  }
  if (status === 429) {
    return new AppError('TRANSCRIPT_SERVICE_LIMIT_REACHED', 'The transcript service has reached its usage limit. Please try again later.', 503, { retryable: true });
  }
  if (status === 400 || status === 404) {
    return new AppError('TRANSCRIPT_UNAVAILABLE', 'No transcript is available for this video.', 422);
  }
  return new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, {
    retryable: RETRYABLE_STATUSES.has(status),
  });
}

function createSerpApiTranscriptService({ config, cache, fetchImpl = global.fetch, sleep = wait, logger = console }) {
  if (typeof fetchImpl !== 'function') throw new Error('A fetch implementation is required.');
  const inFlight = new Map();

  async function requestTranscript({ videoId, languageCode, transcriptType, transcriptTitle }) {
    let lastError;
    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
      let response;
      let body;
      try {
        const endpoint = new URL('https://serpapi.com/search.json');
        endpoint.searchParams.set('engine', 'youtube_video_transcript');
        endpoint.searchParams.set('v', videoId);
        endpoint.searchParams.set('language_code', languageCode);
        if (transcriptType) endpoint.searchParams.set('type', transcriptType);
        if (transcriptTitle) endpoint.searchParams.set('title', transcriptTitle);
        endpoint.searchParams.set('api_key', config.apiKey);

        response = await fetchImpl(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
        try {
          body = await response.json();
        } catch (cause) {
          if (!response.ok) throw classifyHttpError(response.status);
          throw new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, { cause, retryable: true });
        }

        if (!response.ok) throw classifyHttpError(response.status);
        if (body?.error) {
          const errorText = String(body.error).toLowerCase();
          if (errorText.includes('api key') || errorText.includes('invalid key')) {
            throw new AppError('TRANSCRIPT_SERVICE_CONFIGURATION_ERROR', 'The transcript service is temporarily unavailable.', 503);
          }
          if (errorText.includes('limit') || errorText.includes('quota')) {
            throw new AppError('TRANSCRIPT_SERVICE_LIMIT_REACHED', 'The transcript service has reached its usage limit. Please try again later.', 503, { retryable: true });
          }
          throw new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, {
            retryable: /processing|temporary|try again/.test(errorText),
          });
        }

        const searchStatus = safeStatus(body);
        if (!searchStatus) {
          throw new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, { retryable: true });
        }
        if (searchStatus.toLowerCase() !== 'success') {
          throw new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, {
            retryable: /processing|queued|pending/.test(searchStatus.toLowerCase()),
          });
        }
        if (!Array.isArray(body.transcript)) {
          throw new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, { retryable: true });
        }
        return {
          ...normalizeTranscript(body, { videoId, requestedLanguageCode: languageCode }),
          upstreamStatus: response.status,
          searchStatus: searchStatus || 'Success',
          retryCount: attempt,
        };
      } catch (error) {
        if (error?.name === 'AbortError') {
          lastError = new AppError('TRANSCRIPT_SERVICE_TIMEOUT', 'Transcript retrieval took too long. Please try again.', 504, {
            cause: error,
            retryable: true,
          });
        } else if (error instanceof AppError) {
          lastError = error;
        } else {
          lastError = new AppError('TRANSCRIPT_SERVICE_ERROR', 'The transcript provider could not process this video.', 502, {
            cause: error,
            retryable: true,
          });
        }
      } finally {
        clearTimeout(timeout);
      }

      const mustNotRetry = lastError.code === 'TRANSCRIPT_SERVICE_LIMIT_REACHED';
      if (!lastError.retryable || mustNotRetry || attempt >= config.maxRetries) throw lastError;
      const delayMs = (100 * (2 ** attempt)) + Math.floor(Math.random() * 50);
      logger.info?.(JSON.stringify({ event: 'transcript_retry', videoId, retryCount: attempt + 1 }));
      await sleep(delayMs);
    }
    throw lastError;
  }

  async function getYouTubeTranscript({ videoId, languageCode, transcriptType = null, transcriptTitle = null }) {
    const key = createTranscriptCacheKey({ videoId, languageCode, transcriptType, transcriptTitle });
    const cached = cache.get(key);
    if (cached) return { ...cached, cacheHit: true, inFlightDeduplicated: false };

    if (inFlight.has(key)) {
      const result = await inFlight.get(key);
      return { ...structuredClone(result), inFlightDeduplicated: true };
    }

    const promise = requestTranscript({ videoId, languageCode, transcriptType, transcriptTitle })
      .then((result) => {
        cache.set(key, result, config.cacheTtlMs);
        return result;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
    return { ...await promise, inFlightDeduplicated: false };
  }

  return { getYouTubeTranscript, _inFlight: inFlight };
}

module.exports = { createSerpApiTranscriptService };
