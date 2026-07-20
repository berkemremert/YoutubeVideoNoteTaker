const test = require('node:test');
const assert = require('node:assert/strict');
const { createNoteGenerationService, normalizeAndValidateNotes } = require('../src/services/noteGenerationService');

const VALID_NOTES = `## Key Takeaways
Useful takeaway.
## Main Notes
Useful main notes.
## Insights & Highlights
Useful insight.
## Key Terms
Useful term.
## Action Items
Useful action.`;

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
      return { choices: [{ message: { content: `<think>hidden reasoning</think>\n${VALID_NOTES}` } }] };
    } } },
  };
  const service = createNoteGenerationService({ client, config: {} });
  const notes = await service.generateStudyNotes({
    transcript, style: 'study', model: 'accounts/fireworks/models/test', effort: 'quick',
  });
  assert.equal(notes, VALID_NOTES);
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
  let activeSummaries = 0;
  let maximumActiveSummaries = 0;
  const client = {
    chat: { completions: { create: async (request) => {
      const prompt = request.messages[1].content;
      prompts.push(prompt);
      if (request.messages[0].content.startsWith('Extract compact')) {
        activeSummaries += 1;
        maximumActiveSummaries = Math.max(maximumActiveSummaries, activeSummaries);
        await new Promise((resolve) => setImmediate(resolve));
        activeSummaries -= 1;
        return { choices: [{ message: { content: `Facts include ${prompt.slice(-50)}` } }] };
      }
      return { choices: [{ message: { content: VALID_NOTES } }] };
    } } },
  };
  const service = createNoteGenerationService({ client, config: { transcriptChunkChars: 3000, chunkConcurrency: 3 } });
  const longTranscript = {
    segments: Array.from({ length: 300 }, (_, index) => ({
      startTimeText: `${index}:00`,
      text: `${'content '.repeat(8)}${index === 299 ? 'FINAL_END_MARKER' : index}`,
    })),
  };
  const notes = await service.generateStudyNotes({ transcript: longTranscript, style: 'detailed', model: 'test', effort: 'standard' });
  assert.equal(notes, VALID_NOTES);
  assert.ok(prompts.length > 1);
  assert.ok(prompts.some((prompt) => prompt.includes('FINAL_END_MARKER')));
  assert.equal(maximumActiveSummaries, 3);
});

test('drops a reasoning preamble and normalizes bold headings', () => {
  const raw = `The user wants notes, so I should plan them first.\n\n${VALID_NOTES.replace(/^## (.+)$/gm, '**$1**')}`;
  assert.equal(normalizeAndValidateNotes(raw), VALID_NOTES);
});

test('retries once when the model returns planning instead of populated notes', async () => {
  let calls = 0;
  const client = {
    chat: { completions: { create: async () => {
      calls += 1;
      const content = calls === 1
        ? 'The user wants notes.\n\n**Key Takeaways**\n**Main Notes**\n**Insights & Highlights**\n**Key Terms**\n**Action Items**'
        : VALID_NOTES;
      return { choices: [{ message: { content } }] };
    } } },
  };
  const service = createNoteGenerationService({ client, config: {} });
  assert.equal(await service.generateStudyNotes({ transcript, style: 'detailed', model: 'test', effort: 'quick' }), VALID_NOTES);
  assert.equal(calls, 2);
});
