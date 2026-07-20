require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
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

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
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

const youtubedl = require('youtube-dl-exec');

async function transcribeAudioFallback(videoId) {
  if (!process.env.GROQ_API_KEY) {
    throw new Error('NO_CAPTIONS_AND_NO_GROQ_KEY');
  }
  
  // We specify .webm or .m4a to ensure compatibility with Groq Whisper
  const tmpFilePath = path.join(os.tmpdir(), `${videoId}.m4a`);
  
  console.log('Debug: Downloading audio for fallback transcription...');
  await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio', // Native audio format to avoid needing ffmpeg
    output: tmpFilePath,
  });

  console.log('Debug: Audio downloaded, sending to Groq Whisper API...');
  try {
    const transcription = await groq.audio.transcriptions.create({
      file: fs.createReadStream(tmpFilePath),
      model: 'whisper-large-v3',
    });
    return transcription.text;
  } finally {
    if (fs.existsSync(tmpFilePath)) {
      fs.unlinkSync(tmpFilePath);
    }
  }
}

async function fetchTranscript(videoId) {
  // Use yt-dlp to extract the video metadata and subtitles
  // This bypasses most of YouTube's IP blocks
  const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    dumpJson: true,
    skipDownload: true,
    subLangs: 'all',
    writeAutoSubs: true,
    writeSubs: true,
  });

  let subUrl = null;

  const subs = output.subtitles || {};
  const autoSubs = output.automatic_captions || {};

  // Find English first, otherwise pick the first available language
  let selectedTrack = null;
  
  const getEn = (tracks) => tracks['en'] || tracks['en-US'] || tracks['en-GB'] || tracks['en-orig'];
  const getFirst = (tracks) => {
    const keys = Object.keys(tracks);
    return keys.length > 0 ? tracks[keys[0]] : null;
  };

  selectedTrack = getEn(subs) || getEn(autoSubs) || getFirst(subs) || getFirst(autoSubs);

  if (!selectedTrack || selectedTrack.length === 0) {
    console.error('Debug: No suitable track found in subs or autoSubs');
    console.error('Debug: Manual subs keys:', Object.keys(subs));
    console.error('Debug: Auto subs keys:', Object.keys(autoSubs));
    throw new Error('NO_CAPTIONS_TRACKS_NOT_FOUND');
  }

  // Find json3 format which contains the easiest to parse text structure
  const json3 = selectedTrack.find(s => s.ext === 'json3');
  if (json3) {
    subUrl = json3.url;
    console.log('Debug: Found json3 URL:', subUrl.substring(0, 100) + '...');
  } else {
    console.error('Debug: json3 format not found in selected track');
    console.error('Debug: Available formats:', selectedTrack.map(s => s.ext));
    throw new Error('NO_CAPTIONS_JSON3_MISSING');
  }

  // Fetch the actual subtitle data
  const capRes = await fetch(subUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/127.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    }
  });
  if (!capRes.ok) {
    console.error('Failed to fetch caption URL:', capRes.status, capRes.statusText);
    throw new Error('CAPTION_FETCH_FAILED');
  }

  const capData = await capRes.json();
  const events = capData?.events;

  if (!events || events.length === 0) {
    console.error('Caption fetch succeeded but no events/segments found.');
    throw new Error('NO_CAPTIONS');
  }

  // Extract text segments
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
    let transcriptText = '';
    
    try {
      segments = await fetchTranscript(videoId);
      transcriptText = segments.join(' ');
    } catch (err) {
      console.error('Transcript error:', err.message);
      if (err.message === 'VIDEO_NOT_FOUND') {
        return res.status(404).json({ error: 'Video not found. Please check the URL.' });
      }
      
      // If captions are missing, try audio transcription fallback
      if (err.message.includes('NO_CAPTIONS') || err.message === 'CAPTION_FETCH_FAILED') {
        try {
          console.log('Debug: Attempting audio transcription fallback...');
          transcriptText = await transcribeAudioFallback(videoId);
        } catch (audioErr) {
          console.error('Audio Fallback error:', audioErr.message);
          if (audioErr.message === 'NO_CAPTIONS_AND_NO_GROQ_KEY') {
            return res.status(422).json({ error: 'This video has no captions, and no GROQ_API_KEY is set for audio transcription fallback.' });
          }
          return res.status(500).json({ error: 'Video has no captions, and audio transcription fallback failed.' });
        }
      } else {
        return res.status(500).json({ error: `Could not fetch transcript: ${err.message}` });
      }
    }

    if (transcriptText.trim().length < 15) {
      return res.status(422).json({ error: 'Transcript is too short or empty. There is not enough spoken content in this video to take notes on.' });
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
        { role: 'user', content: `Video transcript:\n\n${transcriptText.substring(0, 12000)}` },
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
      wordCount: transcriptText.split(/\s+/).length,
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
