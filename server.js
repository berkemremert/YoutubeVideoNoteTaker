require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const OpenAI = require('openai');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const ai = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

function extractVideoId(url) {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/v\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// ── Custom YouTube transcript fetcher ────────────────────────
const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
};

async function fetchTranscript(videoId) {
  // Step 1: Fetch the YouTube video page to extract caption track URLs
  const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
  const pageRes = await fetch(pageUrl, { headers: BROWSER_HEADERS });

  if (!pageRes.ok) {
    throw new Error(`YouTube returned status ${pageRes.status}`);
  }

  const html = await pageRes.text();

  // Step 2: Extract captions data from the page
  const captionMatch = html.match(/"captions":\s*(\{.*?"playerCaptionsTracklistRenderer".*?\})\s*,\s*"videoDetails"/s);
  if (!captionMatch) {
    // Check if the video exists at all
    if (html.includes('"playabilityStatus":{"status":"ERROR"')) {
      throw new Error('VIDEO_NOT_FOUND');
    }
    throw new Error('NO_CAPTIONS');
  }

  let captionsData;
  try {
    // Extract just the playerCaptionsTracklistRenderer portion
    const jsonStr = captionMatch[1];
    captionsData = JSON.parse(jsonStr);
  } catch {
    throw new Error('NO_CAPTIONS');
  }

  const tracks = captionsData?.playerCaptionsTracklistRenderer?.captionTracks;
  if (!tracks || tracks.length === 0) {
    throw new Error('NO_CAPTIONS');
  }

  // Step 3: Prefer English, fall back to first available track
  const enTrack = tracks.find(t => t.languageCode === 'en') ||
                  tracks.find(t => t.languageCode?.startsWith('en')) ||
                  tracks[0];

  if (!enTrack?.baseUrl) {
    throw new Error('NO_CAPTIONS');
  }

  // Step 4: Fetch the actual caption XML
  const captionUrl = enTrack.baseUrl + '&fmt=json3';
  const capRes = await fetch(captionUrl, { headers: BROWSER_HEADERS });

  if (!capRes.ok) {
    throw new Error('CAPTION_FETCH_FAILED');
  }

  const capData = await capRes.json();
  const events = capData?.events;

  if (!events || events.length === 0) {
    throw new Error('NO_CAPTIONS');
  }

  // Step 5: Extract text segments
  const segments = events
    .filter(e => e.segs)
    .map(e => e.segs.map(s => s.utf8).join(''))
    .filter(t => t.trim());

  if (segments.length === 0) {
    throw new Error('NO_CAPTIONS');
  }

  return segments;
}

const MODEL_DISPLAY_NAMES = {
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'gpt-oss-120b':    'GPT OSS 120B',
  'kimi-k2p6':       'Kimi K2',
  'glm-5p1':         'GLM-5',
  'glm-5p2':         'GLM-5 Pro',
};

function formatModelName(id) {
  const shortId = id.split('/').pop();
  if (MODEL_DISPLAY_NAMES[shortId]) return MODEL_DISPLAY_NAMES[shortId];
  return shortId.split('-').map(w =>
    /^\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');
}

// ── GET /api/models ─────────────────────────────────────────
app.get('/api/models', async (req, res) => {
  try {
    const response = await fetch('https://api.fireworks.ai/inference/v1/models', {
      headers: { Authorization: `Bearer ${process.env.FIREWORKS_API_KEY}` },
    });
    if (!response.ok) throw new Error(`API ${response.status}`);
    const data = await response.json();

    const IMAGE_KEYWORDS = ['flux', 'stable', 'dall', 'midjourney', 'schnell', 'diffusion'];
    const models = (data.data || [])
      .filter(m => !IMAGE_KEYWORDS.some(kw => m.id.toLowerCase().includes(kw)))
      .map(m => ({ id: m.id, name: formatModelName(m.id) }));

    res.json({ models });
  } catch (err) {
    console.error('Models error:', err.message);
    // Fallback to known models
    res.json({
      models: [
        { id: 'accounts/fireworks/models/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
        { id: 'accounts/fireworks/models/gpt-oss-120b',    name: 'GPT OSS 120B' },
        { id: 'accounts/fireworks/models/kimi-k2p6',       name: 'Kimi K2' },
        { id: 'accounts/fireworks/models/glm-5p1',         name: 'GLM-5' },
        { id: 'accounts/fireworks/models/glm-5p2',         name: 'GLM-5 Pro' },
      ],
    });
  }
});

// ── POST /api/generate-notes ─────────────────────────────────
app.post('/api/generate-notes', async (req, res) => {
  const {
    url,
    style  = 'detailed',
    model  = 'accounts/fireworks/models/deepseek-v4-pro',
    effort = 'standard',
  } = req.body;

  if (!url) return res.status(400).json({ error: 'YouTube URL is required' });

  const videoId = extractVideoId(url.trim());
  if (!videoId) return res.status(400).json({ error: 'Invalid YouTube URL.' });

  const EFFORT_CONFIG = {
    quick:    { max_tokens: 1024, temperature: 0.3 },
    standard: { max_tokens: 2048, temperature: 0.4 },
    deep:     { max_tokens: 4096, temperature: 0.3 },
  };
  const { max_tokens, temperature } = EFFORT_CONFIG[effort] ?? EFFORT_CONFIG.standard;

  try {
    let segments;
    try {
      segments = await fetchTranscript(videoId);
    } catch (err) {
      console.error('Transcript error:', err.message);
      if (err.message === 'VIDEO_NOT_FOUND') {
        return res.status(404).json({ error: 'Video not found. Please check the URL.' });
      }
      if (err.message === 'NO_CAPTIONS' || err.message === 'CAPTION_FETCH_FAILED') {
        return res.status(422).json({ error: 'This video does not have captions/subtitles available.' });
      }
      return res.status(500).json({ error: `Could not fetch transcript: ${err.message}` });
    }

    const transcript = segments.join(' ');
    if (transcript.trim().length < 50) {
      return res.status(422).json({ error: 'Transcript is too short or empty.' });
    }

    const stylePrompts = {
      detailed: 'Create comprehensive, detailed notes covering all key points, explanations, and examples mentioned.',
      summary:  'Create a concise executive summary with only the most important takeaways in 300-500 words.',
      bullets:  'Create structured bullet-point notes organized clearly by topic and subtopic.',
      study:    'Create study notes with key terms, definitions, core concepts, and potential exam questions.',
    };

    const systemPrompt = `You are an expert note-taker. Create high-quality, well-structured notes from video transcripts.

Use this Markdown structure:
## Key Takeaways
## Main Notes
## Insights & Highlights
## Key Terms
## Action Items

${stylePrompts[style] ?? stylePrompts.detailed}

Write clearly and concisely. No filler text or padding.`;

    const completion = await ai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Video transcript:\n\n${transcript.substring(0, 12000)}` },
      ],
      max_tokens,
      temperature,
    });

    const notes = completion.choices[0]?.message?.content;
    if (!notes) return res.status(500).json({ error: 'No notes were generated. Please try again.' });

    res.json({
      success: true,
      videoId,
      videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
      wordCount: transcript.split(/\s+/).length,
      notes,
    });
  } catch (err) {
    console.error('Generate error:', err);
    res.status(500).json({ error: err?.message || 'Unexpected error.' });
  }
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
