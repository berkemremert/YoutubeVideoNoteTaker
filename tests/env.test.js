const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../src/config/env');

test('configuration parses numeric settings', () => {
  const config = loadConfig({ env: {
    NODE_ENV: 'test', SERPAPI_API_KEY: 'mock', FIREWORKS_API_KEY: 'mock',
    SERPAPI_TIMEOUT_MS: '1234', SERPAPI_MAX_RETRIES: '0', SERPAPI_CACHE_TTL_MS: '5000',
  } });
  assert.equal(config.serpApi.timeoutMs, 1234);
  assert.equal(config.serpApi.maxRetries, 0);
});

test('configuration rejects invalid numeric settings', () => {
  assert.throws(() => loadConfig({ env: { NODE_ENV: 'test', SERPAPI_TIMEOUT_MS: '-1' } }), /SERPAPI_TIMEOUT_MS/);
});

test('production requires provider keys', () => {
  assert.throws(() => loadConfig({ env: { NODE_ENV: 'production' } }), /SERPAPI_API_KEY/);
});
