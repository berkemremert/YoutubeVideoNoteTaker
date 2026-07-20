const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { TranscriptCache } = require('../src/cache/transcriptCache');
const { createSerpApiTranscriptService } = require('../src/services/serpApiTranscriptService');

const fixture = (name) => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8'));
const config = { apiKey: 'mock-key', timeoutMs: 1000, maxRetries: 1, cacheTtlMs: 10000 };
const silentLogger = { info() {}, warn() {}, error() {} };

function response(status, body) {
  return { ok: status >= 200 && status < 300, status, json: async () => structuredClone(body) };
}

function serviceWith(fetchImpl, overrides = {}) {
  return createSerpApiTranscriptService({
    config: { ...config, ...overrides },
    cache: new TranscriptCache(),
    fetchImpl,
    sleep: async () => {},
    logger: silentLogger,
  });
}

test('normalizes a successful response without provider links or keys', async () => {
  let requestedUrl;
  const service = serviceWith(async (url) => {
    requestedUrl = url;
    return response(200, fixture('serpapi-success.json'));
  });
  const result = await service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' });
  assert.equal(result.videoId, '2QmuhAvJuLE');
  assert.equal(result.resolvedLanguageCode, 'en');
  assert.equal(result.segments[0].text, 'First transcript segment.');
  assert.equal(result.chapters[0].title, 'Introduction');
  assert.equal(result.fullText, 'First transcript segment. Second transcript segment.');
  assert.equal(JSON.stringify(result).includes('serpapi_link'), false);
  assert.equal(JSON.stringify(result).includes('mock-key'), false);
  assert.equal(requestedUrl.searchParams.get('no_cache'), null);
  assert.equal(requestedUrl.searchParams.get('engine'), 'youtube_video_transcript');
});

test('distinguishes requested and resolved languages', async () => {
  const service = serviceWith(async () => response(200, fixture('serpapi-multiple-languages.json')));
  const result = await service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'tr' });
  assert.equal(result.requestedLanguageCode, 'tr');
  assert.equal(result.resolvedLanguageCode, 'en');
});

test('rejects a successful response with an empty transcript', async () => {
  const service = serviceWith(async () => response(200, fixture('serpapi-no-transcript.json')));
  await assert.rejects(
    service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }),
    (error) => error.code === 'TRANSCRIPT_UNAVAILABLE',
  );
});

test('maps authentication and quota errors without retrying', async (t) => {
  for (const [status, code] of [[401, 'TRANSCRIPT_SERVICE_CONFIGURATION_ERROR'], [429, 'TRANSCRIPT_SERVICE_LIMIT_REACHED']]) {
    await t.test(String(status), async () => {
      let calls = 0;
      const service = serviceWith(async () => { calls += 1; return response(status, fixture('serpapi-error.json')); });
      await assert.rejects(service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }), (error) => error.code === code);
      assert.equal(calls, 1);
    });
  }
});

test('retries one transient 503 then succeeds', async () => {
  let calls = 0;
  const service = serviceWith(async () => {
    calls += 1;
    return calls === 1 ? response(503, {}) : response(200, fixture('serpapi-success.json'));
  });
  await service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' });
  assert.equal(calls, 2);
});

test('caches successful responses', async () => {
  let calls = 0;
  const service = serviceWith(async () => { calls += 1; return response(200, fixture('serpapi-success.json')); });
  const first = await service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' });
  const second = await service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' });
  assert.equal(calls, 1);
  assert.equal(first.cacheHit, false);
  assert.equal(second.cacheHit, true);
});

test('deduplicates concurrent requests and cleans the in-flight map', async () => {
  let resolveFetch;
  let calls = 0;
  const service = serviceWith(() => {
    calls += 1;
    return new Promise((resolve) => { resolveFetch = () => resolve(response(200, fixture('serpapi-success.json'))); });
  });
  const requests = Array.from({ length: 5 }, () => service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }));
  await new Promise((resolve) => setImmediate(resolve));
  resolveFetch();
  const results = await Promise.all(requests);
  assert.equal(calls, 1);
  assert.equal(results.filter((result) => result.inFlightDeduplicated).length, 4);
  assert.equal(service._inFlight.size, 0);
});

test('cleans the in-flight map after rejection', async () => {
  const service = serviceWith(async () => response(429, {}));
  await assert.rejects(service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }));
  assert.equal(service._inFlight.size, 0);
});

test('times out, retries at most once, and cleans up', async () => {
  let calls = 0;
  const service = serviceWith((_url, options) => {
    calls += 1;
    return new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
  }, { timeoutMs: 5 });
  await assert.rejects(
    service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }),
    (error) => error.code === 'TRANSCRIPT_SERVICE_TIMEOUT' && !error.message.includes('mock-key'),
  );
  assert.equal(calls, 2);
  assert.equal(service._inFlight.size, 0);
});

test('sanitizes a top-level provider error', async () => {
  const service = serviceWith(async () => response(200, fixture('serpapi-error.json')));
  await assert.rejects(
    service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }),
    (error) => error.code === 'TRANSCRIPT_SERVICE_CONFIGURATION_ERROR' && !error.message.includes('secret-provider-detail'),
  );
});

test('rejects malformed successful responses without caching them', async () => {
  let calls = 0;
  const service = serviceWith(async () => {
    calls += 1;
    return response(200, { search_metadata: { status: 'Success' }, transcript: null });
  });
  await assert.rejects(
    service.getYouTubeTranscript({ videoId: '2QmuhAvJuLE', languageCode: 'en' }),
    (error) => error.code === 'TRANSCRIPT_SERVICE_ERROR',
  );
  assert.equal(calls, 2);
});
