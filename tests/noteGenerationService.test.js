const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoteGenerationService } = require('../src/services/noteGenerationService');

const transcript = {
  segments: [
    { startTimeText: '0:00', text: 'This is a sufficiently long transcript segment for a note generation test.' },
  ],
};

test('preserves the Fireworks-compatible note prompt and strips reasoning tags', async () => {
  let request;
  const client = {
    chat: { completions: { create: async (value) => {
      request = value;
      return { choices: [{ message: { content: '<think>hidden reasoning</think>\n## Key Takeaways\nUseful notes' } }] };
    } } },
  };
  const service = createNoteGenerationService({ client, config: {} });
  const notes = await service.generateStudyNotes({
    transcript, style: 'study', model: 'accounts/fireworks/models/test', effort: 'quick',
  });
  assert.equal(notes, '## Key Takeaways\nUseful notes');
  assert.equal(request.model, 'accounts/fireworks/models/test');
  assert.match(request.messages[0].content, /potential exam questions/);
  assert.match(request.messages[1].content, /\[0:00\]/);
});

test('maps provider failures to NOTE_GENERATION_FAILED', async () => {
  const client = { chat: { completions: { create: async () => { throw new Error('secret upstream detail'); } } } };
  const service = createNoteGenerationService({ client, config: {} });
  await assert.rejects(
    service.generateStudyNotes({ transcript, style: 'detailed', model: 'test', effort: 'standard' }),
    (error) => error.code === 'NOTE_GENERATION_FAILED' && !error.message.includes('secret upstream detail'),
  );
});

test('long transcripts are chunked without dropping the ending', async () => {
  const prompts = [];
  const client = {
    chat: { completions: { create: async (request) => {
      const prompt = request.messages[1].content;
      prompts.push(prompt);
      if (prompt.startsWith('Chunk ')) return { choices: [{ message: { content: `Summary includes ${prompt.slice(-30)}` } }] };
      return { choices: [{ message: { content: '## Key Takeaways\nSynthesized notes' } }] };
    } } },
  };
  const service = createNoteGenerationService({ client, config: {} });
  const longTranscript = {
    segments: Array.from({ length: 300 }, (_, index) => ({
      startTimeText: `${index}:00`,
      text: `${'content '.repeat(8)}${index === 299 ? 'FINAL_END_MARKER' : index}`,
    })),
  };
  const notes = await service.generateStudyNotes({ transcript: longTranscript, style: 'detailed', model: 'test', effort: 'standard' });
  assert.equal(notes, '## Key Takeaways\nSynthesized notes');
  assert.ok(prompts.length > 1);
  assert.ok(prompts.some((prompt) => prompt.includes('FINAL_END_MARKER')));
});
