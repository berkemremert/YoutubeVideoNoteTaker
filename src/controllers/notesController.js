const AppError = require('../errors/AppError');
const { normalizeLanguage } = require('../config/env');
const { extractYouTubeVideoId } = require('../utils/youtubeUrl');

const ALLOWED_FIELDS = new Set(['url', 'style', 'model', 'effort', 'languageCode']);
const ALLOWED_EFFORTS = new Set(['quick', 'standard', 'deep']);

function createNotesController({ transcriptService, noteGenerationService, config, logger = console }) {
  function validateRequest(req, _res, next) {
    try {
      if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
        throw new AppError('INVALID_REQUEST', 'A JSON request body is required.', 400);
      }
      const unsupported = Object.keys(req.body).filter((key) => !ALLOWED_FIELDS.has(key));
      if (unsupported.length) throw new AppError('UNSUPPORTED_FIELDS', 'The request contains unsupported fields.', 400);

      req.videoId = extractYouTubeVideoId(req.body.url);
      const languageCode = normalizeLanguage(req.body.languageCode || config.serpApi.defaultLanguage);
      const style = typeof req.body.style === 'string' ? req.body.style.trim() : 'detailed';
      const model = typeof req.body.model === 'string' ? req.body.model.trim() : 'accounts/fireworks/models/deepseek-v4-pro';
      const effort = ALLOWED_EFFORTS.has(req.body.effort) ? req.body.effort : 'standard';
      if (!style || style.length > 500 || !model || model.length > 200) {
        throw new AppError('INVALID_REQUEST', 'The request contains invalid note options.', 400);
      }
      req.notesInput = { languageCode, style, model, effort };
      next();
    } catch (error) {
      next(error instanceof AppError ? error : new AppError('INVALID_REQUEST', 'The request contains invalid options.', 400));
    }
  }

  async function generateNotes(req, res, next) {
    const startedAt = Date.now();
    try {
      const transcript = await transcriptService.getYouTubeTranscript({
        videoId: req.videoId,
        languageCode: req.notesInput.languageCode,
      });
      const notes = await noteGenerationService.generateStudyNotes({
        transcript,
        style: req.notesInput.style,
        model: req.notesInput.model,
        effort: req.notesInput.effort,
      });

      logger.info?.(JSON.stringify({
        event: 'notes_generated',
        requestId: req.requestId,
        videoId: req.videoId,
        requestedLanguageCode: transcript.requestedLanguageCode,
        resolvedLanguageCode: transcript.resolvedLanguageCode,
        cacheHit: transcript.cacheHit,
        inFlightDeduplicated: transcript.inFlightDeduplicated,
        upstreamStatus: transcript.upstreamStatus,
        searchStatus: transcript.searchStatus,
        retryCount: transcript.retryCount,
        segmentCount: transcript.segments.length,
        chapterCount: transcript.chapters.length,
        durationMs: Date.now() - startedAt,
      }));

      res.json({
        success: true,
        videoId: req.videoId,
        videoUrl: `https://www.youtube.com/watch?v=${req.videoId}`,
        wordCount: transcript.fullText.split(/\s+/).filter(Boolean).length,
        notes,
        transcript: {
          languageCode: transcript.resolvedLanguageCode,
          requestedLanguageCode: transcript.requestedLanguageCode,
          type: transcript.transcriptType,
          segmentCount: transcript.segments.length,
          chapters: transcript.chapters,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  return { validateRequest, generateNotes };
}

module.exports = { createNotesController };
