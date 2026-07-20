require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { YoutubeTranscript } = require('youtube-transcript');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize Fireworks client via OpenAI-compatible SDK
const fireworks = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

// Helper: extract video ID from YouTube URL
function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// POST /api/generate-notes
app.post('/api/generate-notes', async (req, res) => {
  const { url, style = 'detailed' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'YouTube URL is required' });
  }

  const videoId = extractVideoId(url.trim());
  if (!videoId) {
    return res.status(400).json({ error: 'Invalid YouTube URL. Please provide a valid YouTube link.' });
  }

  try {
    // Step 1: Fetch transcript
    let transcriptItems;
    try {
      transcriptItems = await YoutubeTranscript.fetchTranscript(videoId);
    } catch (err) {
      const msg = err.message || '';
      if (msg.includes('disabled') || msg.includes('no transcript')) {
        return res.status(422).json({ error: 'This video does not have captions/transcripts enabled.' });
      }
      throw err;
    }

    const transcript = transcriptItems.map(item => item.text).join(' ');

    if (!transcript || transcript.trim().length < 50) {
      return res.status(422).json({ error: 'Transcript is too short or empty for this video.' });
    }

    // Step 2: Build prompt based on style
    const stylePrompts = {
      detailed: 'Create comprehensive, detailed notes with all key points, explanations, and examples mentioned.',
      summary: 'Create a concise executive summary with only the most important takeaways.',
      bullets: 'Create structured bullet-point notes organized by topic.',
      study: 'Create study notes with key terms, definitions, concepts, and potential exam questions.',
    };

    const styleInstruction = stylePrompts[style] || stylePrompts.detailed;

    const systemPrompt = `You are an expert note-taker and learning assistant. Your job is to create high-quality, well-structured notes from video transcripts.

Format your response using Markdown with the following structure:
- ## 📌 Key Takeaways (3-5 bullet points at the top)
- ## 📖 Main Notes (organized sections with headers)
- ## 💡 Insights & Highlights (interesting points or quotes)
- ## 🔑 Key Terms (if applicable)
- ## ✅ Action Items (if the video suggests things to do)

${styleInstruction}

Make the notes informative, easy to read, and genuinely useful. Do not include filler text.`;

    const userPrompt = `Here is the transcript from a YouTube video. Please create notes from it:\n\n${transcript.substring(0, 12000)}`;

    // Step 3: Call Fireworks AI
    const completion = await fireworks.chat.completions.create({
      model: 'accounts/fireworks/models/deepseek-v4-pro',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: 2048,
      temperature: 0.4,
    });

    const notes = completion.choices[0]?.message?.content;
    if (!notes) {
      return res.status(500).json({ error: 'AI did not return any notes. Please try again.' });
    }

    // Return notes + metadata
    res.json({
      success: true,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      transcriptLength: transcript.length,
      wordCount: transcript.split(/\s+/).length,
      notes,
    });
  } catch (error) {
    console.error('Error generating notes:', error);
    const message = error?.message || 'An unexpected error occurred.';
    res.status(500).json({ error: message });
  }
});

// Serve frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`🚀 YouTube Note Taker running at http://localhost:${PORT}`);
});
