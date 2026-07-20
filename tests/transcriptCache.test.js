const test = require('node:test');
const assert = require('node:assert/strict');
const { TranscriptCache, createTranscriptCacheKey } = require('../src/cache/transcriptCache');

test('cache expires entries and returns copies', () => {
  let now = 10;
  const cache = new TranscriptCache({ maxEntries: 2, now: () => now });
  cache.set('a', { nested: { value: 1 } }, 10);
  const value = cache.get('a');
  value.nested.value = 2;
  assert.equal(cache.get('a').nested.value, 1);
  now = 20;
  assert.equal(cache.get('a'), null);
});

test('cache evicts the least recently used entry at maximum size', () => {
  const cache = new TranscriptCache({ maxEntries: 2 });
  cache.set('a', 1, 1000);
  cache.set('b', 2, 1000);
  cache.get('a');
  cache.set('c', 3, 1000);
  assert.equal(cache.get('b'), null);
  assert.equal(cache.get('a'), 1);
});

test('cache keys normalize optional request parameters', () => {
  assert.equal(createTranscriptCacheKey({ videoId: '2QmuhAvJuLE', languageCode: 'EN' }), 'transcript:2QmuhAvJuLE:en:default:default');
});
