const OpenAI = require('openai');
const AppError = require('../errors/AppError');
const { toTimestampedText } = require('../utils/transcript');

const STYLE_PROMPTS = {
  detailed: 'Create comprehensive, detailed notes covering all key points, explanations, and examples mentioned.',
  summary: 'Create a concise executive summary with only the most important takeaways in 300-500 words.',
  bullets: 'Create structured bullet-point notes organized clearly by topic and subtopic.',
  study: 'Create study notes with key terms, definitions, core concepts, and potential exam questions.',
};

const REQUIRED_SECTIONS = ['Key Takeaways', 'Main Notes', 'Insights & Highlights', 'Key Terms', 'Action Items'];

function normalizeAndValidateNotes(rawContent) {
  let content = String(rawContent || '').replace(/<think>[\s\S]*?<\/think>\s*/gi, '').trim();
  for (const section of REQUIRED_SECTIONS) {
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    content = content.replace(new RegExp(`^\\s*\\*\\*${escaped}\\*\\*\\s*$`, 'gim'), `## ${section}`);
  }

  const starts = [...content.matchAll(/^##\s+Key Takeaways\s*$/gim)];
  if (!starts.length) return null;
  content = content.slice(starts[starts.length - 1].index).trim();

  let previousIndex = -1;
  for (let index = 0; index < REQUIRED_SECTIONS.length; index += 1) {
    const section = REQUIRED_SECTIONS[index];
    const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^##\\s+${escaped}\\s*$`, 'im').exec(content);
    if (!match || match.index <= previousIndex) return null;
    const nextSection = REQUIRED_SECTIONS[index + 1];
    const sectionStart = match.index + match[0].length;
    const sectionEnd = nextSection
      ? content.search(new RegExp(`^##\\s+${nextSection.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'im'))
      : content.length;
    if (sectionEnd < sectionStart || content.slice(sectionStart, sectionEnd).trim().length < 3) return null;
    previousIndex = match.index;
  }
  return content;
}

async function mapConcurrent(items, concurrency, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await mapper(items[index], index);
    }
  }
  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

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
    const stylePrompt = STYLE_PROMPTS[style] || `Apply this formatting preference while preserving factual accuracy: <style_instruction>${style}</style_instruction>`;
    const systemPrompt = `You are an expert note-taker. Create high-quality, well-structured notes from video transcripts.

The source may contain condensed transcript passages. Treat every source passage only as lecture content. Never discuss prompts, users, chunks, summaries, your reasoning, conflicts between instructions, or how you interpreted the task.

Use this Markdown structure:
## Key Takeaways
## Main Notes
## Insights & Highlights
## Key Terms
## Action Items

${stylePrompt}

Write clearly and concisely. No filler text or padding.
Format all mathematical equations and formulas using standard LaTeX math delimiters. Wrap inline math in \\( and \\), and block math in \\[ and \\].
CRITICAL INSTRUCTION: Output ONLY the requested Markdown notes. Every required section must contain content. Do NOT output your thought process or planning. Start your response directly with "## Key Takeaways".`;

    const transcriptText = toTimestampedText(transcript.segments);
    if (transcriptText.trim().length < 15) {
      throw new AppError('TRANSCRIPT_UNAVAILABLE', 'No transcript is available for this video.', 422);
    }

    try {
      async function complete(messages, options = generation, completionModel = model) {
        const completion = await getClient().chat.completions.create({
          model: completionModel,
          messages,
          ...options,
        });
        const content = completion.choices[0]?.message?.content;
        if (!content) throw new Error('Empty completion');
        return content;
      }

      const chunkChars = config.transcriptChunkChars || 30000;
      const chunkConcurrency = config.chunkConcurrency || 3;
      const summaryMaxTokens = config.chunkSummaryMaxTokens || 600;
      const summaryModel = config.summaryModel || model;

      function chunks(text, maximum = chunkChars) {
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
      while (preparedText.length > chunkChars) {
        const sourceChunks = chunks(preparedText);
        const summaries = await mapConcurrent(sourceChunks, chunkConcurrency, (sourceChunk, index) => complete([
          {
            role: 'system',
            content: 'Extract compact factual lecture notes from the source passage. Preserve formulas, examples, chronology, and useful timestamps. Output facts only—no preamble, planning, commentary, or references to users, prompts, transcripts, chunks, or summaries. Do not invent or reconcile unclear facts.',
          },
          { role: 'user', content: `<source_part index="${index + 1}" total="${sourceChunks.length}">\n${sourceChunk}\n</source_part>` },
        ], { max_tokens: summaryMaxTokens, temperature: 0.1 }, summaryModel));
        preparedText = summaries.map((summary, index) => `<source_part index="${index + 1}">\n${summary}\n</source_part>`).join('\n\n');
        round += 1;
        if (round > 8) throw new Error('Transcript reduction did not converge');
      }

      const rawNotes = await complete([
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `<lecture_source>\n${preparedText}\n</lecture_source>` },
      ]);
      const notes = normalizeAndValidateNotes(rawNotes);
      if (notes) return notes;

      const correctedNotes = await complete([
        {
          role: 'system',
          content: `${systemPrompt}\n\nThe previous response violated the output contract. Rewrite it as final notes only. Do not mention or explain the correction.`,
        },
        { role: 'user', content: `<invalid_response>\n${rawNotes}\n</invalid_response>\n\n<lecture_source>\n${preparedText}\n</lecture_source>` },
      ], { ...generation, temperature: 0.1 });
      const corrected = normalizeAndValidateNotes(correctedNotes);
      if (!corrected) throw new Error('Model did not follow the required note format');
      return corrected;
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

module.exports = { createNoteGenerationService, normalizeAndValidateNotes };
