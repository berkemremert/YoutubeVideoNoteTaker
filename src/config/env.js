const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

function positiveInteger(env, name, fallback, { allowZero = false } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  const minimum = allowZero ? 0 : 1;
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer greater than or equal to ${minimum}.`);
  }
  return value;
}

function normalizeLanguage(value) {
  const language = String(value || 'en').trim().toLowerCase();
  if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language)) {
    throw new Error('DEFAULT_TRANSCRIPT_LANGUAGE must be a valid language code.');
  }
  return language;
}

function loadConfig({ env = process.env } = {}) {
  const nodeEnv = env.NODE_ENV || 'development';
  const config = {
      nodeEnv,
      port: positiveInteger(env, 'PORT', 3000),
      serpApi: {
        apiKey: env.SERPAPI_API_KEY || '',
        timeoutMs: positiveInteger(env, 'SERPAPI_TIMEOUT_MS', 20000),
        maxRetries: positiveInteger(env, 'SERPAPI_MAX_RETRIES', 1, { allowZero: true }),
        cacheTtlMs: positiveInteger(env, 'SERPAPI_CACHE_TTL_MS', 86400000),
        cacheMaxEntries: positiveInteger(env, 'SERPAPI_CACHE_MAX_ENTRIES', 500),
        defaultLanguage: normalizeLanguage(env.DEFAULT_TRANSCRIPT_LANGUAGE),
      },
      rateLimit: {
        windowMs: positiveInteger(env, 'TRANSCRIPT_REQUEST_LIMIT_WINDOW_MS', 900000),
        max: positiveInteger(env, 'TRANSCRIPT_REQUEST_LIMIT_MAX', 10),
      },
      fireworks: {
        apiKey: env.FIREWORKS_API_KEY || '',
        baseUrl: 'https://api.fireworks.ai/inference/v1',
      },
  };

    if (nodeEnv === 'production' && !config.serpApi.apiKey) {
      throw new Error('SERPAPI_API_KEY is required in production.');
    }
    if (nodeEnv === 'production' && !config.fireworks.apiKey) {
      throw new Error('FIREWORKS_API_KEY is required in production.');
    }
  return config;
}

module.exports = { loadConfig, normalizeLanguage };
