const test = require('node:test');
const assert = require('node:assert/strict');
const AppError = require('../src/errors/AppError');
const { createApp } = require('../server');

const config = {
  nodeEnv: 'test',
  port: 0,
  serpApi: {
    apiKey: 'mock-key', timeoutMs: 100, maxRetries: 0, cacheTtlMs: 1000,
    cacheMaxEntries: 10, defaultLanguage: 'en',
  },
  rateLimit: { windowMs: 1000, max: 100 },
  fireworks: { apiKey: 'mock-key', baseUrl: 'https://example.invalid' },
};
const logger = { info() {}, warn() {}, error() {} };

const transcript = {
  provider: 'serpapi', videoId: '2QmuhAvJuLE', requestedLanguageCode: 'en', resolvedLanguageCode: 'en',
  transcriptType: 'asr', segments: [{ startMs: 0, endMs: 1000, startTimeText: '0:00', text: 'Enough transcript text for generating useful notes.' }],
  chapters: [], availableTranscripts: [], fullText: 'Enough transcript text for generating useful notes.', fetchedAt: new Date().toISOString(),
  cacheHit: false, inFlightDeduplicated: false,
};

async function withServer(services, callback, appConfig = config) {
  const app = createApp({ config: appConfig, logger, ...services });
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function post(baseUrl, body) {
  const response = await fetch(`${baseUrl}/api/generate-notes`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { response, body: await response.json() };
}

test('valid route request preserves the frontend response contract', async () => {
  const transcriptService = { getYouTubeTranscript: async () => structuredClone(transcript) };
  const noteGenerationService = { generateStudyNotes: async () => '## Key Takeaways\nNotes' };
  await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
    const result = await post(baseUrl, { url: 'https://youtu.be/2QmuhAvJuLE', style: 'detailed' });
    assert.equal(result.response.status, 200);
    assert.equal(result.body.success, true);
    assert.equal(result.body.videoId, '2QmuhAvJuLE');
    assert.equal(result.body.notes, '## Key Takeaways\nNotes');
    assert.equal(result.body.transcript.languageCode, 'en');
  });
});

test('invalid URLs are rejected before the transcript service', async () => {
  let calls = 0;
  const transcriptService = { getYouTubeTranscript: async () => { calls += 1; } };
  const noteGenerationService = { generateStudyNotes: async () => '' };
  await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
    const result = await post(baseUrl, { url: 'https://example.com/not-youtube' });
    assert.equal(result.response.status, 400);
    assert.equal(result.body.error.code, 'INVALID_YOUTUBE_URL');
    assert.equal(calls, 0);
  });
});

test('route keeps transcript, provider-limit, and note errors distinct', async (t) => {
  const cases = [
    [new AppError('TRANSCRIPT_UNAVAILABLE', 'No transcript is available for this video.', 422), 422],
    [new AppError('TRANSCRIPT_SERVICE_LIMIT_REACHED', 'The transcript service has reached its usage limit. Please try again later.', 503, { retryable: true }), 503],
  ];
  for (const [error, status] of cases) {
    await t.test(error.code, async () => {
      const transcriptService = { getYouTubeTranscript: async () => { throw error; } };
      const noteGenerationService = { generateStudyNotes: async () => '' };
      await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
        const result = await post(baseUrl, { url: '2QmuhAvJuLE' });
        assert.equal(result.response.status, status);
        assert.equal(result.body.error.code, error.code);
      });
    });
  }

  await t.test('NOTE_GENERATION_FAILED', async () => {
    const transcriptService = { getYouTubeTranscript: async () => structuredClone(transcript) };
    const noteGenerationService = { generateStudyNotes: async () => { throw new AppError('NOTE_GENERATION_FAILED', 'The transcript was retrieved, but the notes could not be generated.', 502); } };
    await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
      const result = await post(baseUrl, { url: '2QmuhAvJuLE' });
      assert.equal(result.response.status, 502);
      assert.equal(result.body.error.code, 'NOTE_GENERATION_FAILED');
    });
  });
});

test('health check makes no external calls', async () => {
  const transcriptService = { getYouTubeTranscript: async () => { throw new Error('must not be called'); } };
  const noteGenerationService = { generateStudyNotes: async () => { throw new Error('must not be called'); } };
  await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).status, 'ok');
  });
});

test('rate limiting runs before external services after input validation', async () => {
  let transcriptCalls = 0;
  const transcriptService = { getYouTubeTranscript: async () => { transcriptCalls += 1; return structuredClone(transcript); } };
  const noteGenerationService = { generateStudyNotes: async () => 'notes' };
  const limitedConfig = { ...config, rateLimit: { windowMs: 60000, max: 1 } };
  await withServer({ transcriptService, noteGenerationService }, async (baseUrl) => {
    const first = await post(baseUrl, { url: '2QmuhAvJuLE' });
    const second = await post(baseUrl, { url: '2QmuhAvJuLE' });
    assert.equal(first.response.status, 200);
    assert.equal(second.response.status, 429);
    assert.equal(second.body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(transcriptCalls, 1);
  }, limitedConfig);
});
