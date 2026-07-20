const express = require('express');
const cors = require('cors');
const path = require('path');
const { loadConfig } = require('./src/config/env');
const { TranscriptCache } = require('./src/cache/transcriptCache');
const { createSerpApiTranscriptService } = require('./src/services/serpApiTranscriptService');
const { createNoteGenerationService } = require('./src/services/noteGenerationService');
const { createNotesController } = require('./src/controllers/notesController');
const { createNotesRoutes } = require('./src/routes/notesRoutes');
const { requestId } = require('./src/middleware/requestId');
const { errorHandler, notFound } = require('./src/middleware/errorHandler');

const MODEL_DISPLAY_NAMES = {
  'deepseek-v4-pro': 'DeepSeek V4 Pro',
  'gpt-oss-120b': 'GPT OSS 120B',
  'kimi-k2p6': 'Kimi K2',
  'glm-5p1': 'GLM-5',
  'glm-5p2': 'GLM-5 Pro',
};

const FALLBACK_MODELS = [
  { id: 'accounts/fireworks/models/deepseek-v4-pro', name: 'DeepSeek V4 Pro' },
  { id: 'accounts/fireworks/models/gpt-oss-120b', name: 'GPT OSS 120B' },
  { id: 'accounts/fireworks/models/kimi-k2p6', name: 'Kimi K2' },
  { id: 'accounts/fireworks/models/glm-5p1', name: 'GLM-5' },
  { id: 'accounts/fireworks/models/glm-5p2', name: 'GLM-5 Pro' },
];

function formatModelName(id) {
  const shortId = id.split('/').pop();
  if (MODEL_DISPLAY_NAMES[shortId]) return MODEL_DISPLAY_NAMES[shortId];
  return shortId.split('-').map((word) => (
    /^\d/.test(word) ? word.toUpperCase() : word.charAt(0).toUpperCase() + word.slice(1)
  )).join(' ');
}

function createApp({
  config = loadConfig(),
  transcriptService,
  noteGenerationService,
  fetchImpl = global.fetch,
  logger = console,
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(cors());
  app.use(requestId);
  app.use(express.json({ limit: '16kb' }));

  const cache = new TranscriptCache({ maxEntries: config.serpApi.cacheMaxEntries });
  const transcripts = transcriptService || createSerpApiTranscriptService({
    config: config.serpApi,
    cache,
    fetchImpl,
    logger,
  });
  const noteGenerator = noteGenerationService || createNoteGenerationService({ config: config.fireworks });
  const controller = createNotesController({
    transcriptService: transcripts,
    noteGenerationService: noteGenerator,
    config,
    logger,
  });

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      services: {
        transcriptProviderConfigured: Boolean(config.serpApi.apiKey),
        noteProviderConfigured: Boolean(config.fireworks.apiKey),
      },
    });
  });

  app.get('/api/models', async (_req, res) => {
    try {
      const response = await fetchImpl(`${config.fireworks.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${config.fireworks.apiKey}` },
      });
      if (!response.ok) throw new Error('Model provider request failed');
      const data = await response.json();
      const imageKeywords = ['flux', 'stable', 'dall', 'midjourney', 'schnell', 'diffusion'];
      const models = (data.data || [])
        .filter((model) => !imageKeywords.some((keyword) => model.id.toLowerCase().includes(keyword)))
        .map((model) => ({ id: model.id, name: formatModelName(model.id) }));
      res.json({ models });
    } catch {
      res.json({ models: FALLBACK_MODELS });
    }
  });

  app.use('/api', createNotesRoutes({ controller, rateLimitConfig: config.rateLimit }));
  app.use('/api', notFound);
  app.use(express.static(path.join(__dirname, 'public')));
  app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
  app.use(errorHandler(logger));
  return app;
}

if (require.main === module) {
  const config = loadConfig();
  const app = createApp({ config });
  app.listen(config.port, () => {
    console.log(`Server running at http://localhost:${config.port}`);
  });
}

module.exports = { createApp };
