const OpenAI = require('openai');
const AppError = require('../errors/AppError');
const { toTimestampedText } = require('../utils/transcript');

const STYLE_PROMPTS = {
  detailed: 'Create comprehensive, detailed notes covering all key points, explanations, and examples mentioned.',
  summary: 'Create a concise executive summary with only the most important takeaways in 300-500 words.',
  bullets: 'Create structured bullet-point notes organized clearly by topic and subtopic.',
  study: 'Create study notes with key terms, definitions, core concepts, and potential exam questions.',
};

function createNoteGenerationService({ config, client } = {}) {
  let ai = client;
  function getClient() {
    if (!ai) ai = new OpenAI({ apiKey: config.apiKey, baseURL: config.baseUrl });
    return ai;
  }

  async function generateStudyNotes({ transcript, style, model, effort }) {
    const effortConfig = {
      quick: { max_tokens: 1024, temperature: 0.3 },
      standard: { max_tokens: 2048, temperature: 0.4 },
      deep: { max_tokens: 4096, temperature: 0.3 },
    };
    const generation = effortConfig[effort] || effortConfig.standard;
    const stylePrompt = STYLE_PROMPTS[style] || `Follow this custom instruction for the style and formatting of the notes: ${style}`;
    const systemPrompt = `You are an expert note-taker. Create high-quality, well-structured notes from video transcripts.

Use this Markdown structure:
## Key Takeaways
## Main Notes
## Insights & Highlights
## Key Terms
## Action Items

${stylePrompt}

Write clearly and concisely. No filler text or padding.
CRITICAL INSTRUCTION: Output ONLY the requested Markdown notes. Do NOT output your thought process. Do NOT start by saying "The user wants me to..." or provide any conversational filler. Start your response directly with "## Key Takeaways".`;

    const transcriptText = toTimestampedText(transcript.segments);
    if (transcriptText.trim().length < 15) {
      throw new AppError('TRANSCRIPT_UNAVAILABLE', 'No transcript is available for this video.', 422);
    }

    try {
      async function complete(messages, options = generation) {
        const completion = await getClient().chat.completions.create({
          model,
          messages,
          ...options,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('Empty completion');
        return content;
      }

      function chunks(text, maximum = 12000) {
        const result = [];
        let current = '';
        for (const line of text.split('\n')) {
          if (line.length > maximum) {
            if (current) result.push(current);
            for (let index = 0; index < line.length; index += maximum) result.push(line.slice(index, index + maximum));
            current = '';
          } else if (!current || current.length + line.length + 1 <= maximum) {
            current += `${current ? '\n' : ''}${line}`;
          } else {
            result.push(current);
            current = line;
          }
        }
        if (current) result.push(current);
        return result;
      }

      let preparedText = transcriptText;
      let round = 0;
      while (preparedText.length > 12000) {
        const sourceChunks = chunks(preparedText);
        const summaries = [];
        for (let index = 0; index < sourceChunks.length; index += 1) {
          summaries.push(await complete([
            { role: 'system', content: 'Summarize this transcript chunk faithfully. Preserve key facts, examples, chronology, and any timestamps. Do not invent details.' },
            { role: 'user', content: `Chunk ${index + 1} of ${sourceChunks.length}:\n\n${sourceChunks[index]}` },
          ], { max_tokens: 1024, temperature: 0.2 }));
        }
        preparedText = summaries.map((summary, index) => `Chunk ${index + 1} summary:\n${summary}`).join('\n\n');
        round += 1;
        if (round > 8) throw new Error('Transcript reduction did not converge');
      }

      const rawNotes = await complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Video transcript${preparedText === transcriptText ? '' : ' chunk summaries'}:\n\n${preparedText}` },
      ]);
      let notes = rawNotes;
      notes = notes.replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
      return notes;
    } catch (cause) {
      if (cause instanceof AppError) throw cause;
      throw new AppError('NOTE_GENERATION_FAILED', 'The transcript was retrieved, but the notes could not be generated.', 502, {
        cause,
        retryable: true,
      });
    }
  }

  return { generateStudyNotes };
}

module.exports = { createNoteGenerationService };
