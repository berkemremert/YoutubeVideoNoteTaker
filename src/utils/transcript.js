const AppError = require('../errors/AppError');

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeTranscript(body, { videoId, requestedLanguageCode }) {
  const segments = Array.isArray(body.transcript)
    ? body.transcript.map((segment) => ({
      startMs: finiteNumber(segment?.start_ms),
      endMs: finiteNumber(segment?.end_ms),
      startTimeText: typeof segment?.start_time_text === 'string' ? segment.start_time_text.trim() : '',
      text: typeof segment?.snippet === 'string' ? segment.snippet.trim() : '',
    })).filter((segment) => segment.text)
    : [];

  if (segments.length === 0) {
    throw new AppError('TRANSCRIPT_UNAVAILABLE', 'No transcript is available for this video.', 422);
  }

  const availableTranscripts = Array.isArray(body.available_transcripts)
    ? body.available_transcripts.map((track) => ({
      title: typeof track?.title === 'string' ? track.title : null,
      languageName: typeof track?.language_name === 'string' ? track.language_name : null,
      languageCode: typeof track?.language_code === 'string' ? track.language_code.toLowerCase() : null,
      type: typeof track?.type === 'string' ? track.type : null,
      selected: track?.selected === true,
    }))
    : [];
  const selected = availableTranscripts.find((track) => track.selected);

  const chapters = Array.isArray(body.chapters)
    ? body.chapters.map((chapter) => ({
      title: typeof chapter?.chapter === 'string' ? chapter.chapter.trim() : '',
      startMs: finiteNumber(chapter?.start_ms),
      endMs: finiteNumber(chapter?.end_ms),
    })).filter((chapter) => chapter.title)
    : [];

  return {
    provider: 'serpapi',
    videoId,
    requestedLanguageCode,
    resolvedLanguageCode: selected?.languageCode || requestedLanguageCode,
    transcriptType: selected?.type || null,
    transcriptTitle: selected?.title || null,
    segments,
    chapters,
    availableTranscripts,
    fullText: segments.map((segment) => segment.text).join(' '),
    fetchedAt: new Date().toISOString(),
    cacheHit: false,
  };
}

function toTimestampedText(segments) {
  return segments.map((segment) => {
    const timestamp = segment.startTimeText ? `[${segment.startTimeText}] ` : '';
    return `${timestamp}${segment.text}`;
  }).join('\n');
}

module.exports = { normalizeTranscript, toTimestampedText };
