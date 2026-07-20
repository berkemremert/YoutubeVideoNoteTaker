const test = require('node:test');
const assert = require('node:assert/strict');
const { extractYouTubeVideoId } = require('../src/utils/youtubeUrl');

const id = '2QmuhAvJuLE';
const validInputs = [
  `https://www.youtube.com/watch?v=${id}`,
  `https://youtube.com/watch?v=${id}&list=abc&t=5`,
  `https://youtu.be/${id}?si=tracking`,
  `https://www.youtube.com/shorts/${id}`,
  `https://www.youtube.com/embed/${id}`,
  `https://www.youtube.com/live/${id}`,
  id,
];

for (const input of validInputs) {
  test(`extracts video ID from ${input}`, () => assert.equal(extractYouTubeVideoId(input), id));
}

for (const input of [
  '',
  'https://example.com/watch?v=2QmuhAvJuLE',
  'https://youtube.com/playlist?list=abc',
  'bad-id',
  'javascript:alert(1)',
  `https://youtube.com/watch?v=${'a'.repeat(3000)}`,
]) {
  test(`rejects invalid input ${String(input).slice(0, 40)}`, () => {
    assert.throws(() => extractYouTubeVideoId(input), (error) => error.code === 'INVALID_YOUTUBE_URL');
  });
}
