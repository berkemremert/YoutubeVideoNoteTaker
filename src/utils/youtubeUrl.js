const AppError = require('../errors/AppError');

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;
const SUPPORTED_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be', 'www.youtu.be']);

function invalidUrl() {
  return new AppError('INVALID_YOUTUBE_URL', 'Enter a valid YouTube video URL.', 400);
}

function extractYouTubeVideoId(input) {
  if (typeof input !== 'string') throw invalidUrl();
  const value = input.trim();
  if (!value || value.length > 2048) throw invalidUrl();
  if (VIDEO_ID_PATTERN.test(value)) return value;

  let url;
  try {
    url = new URL(value);
  } catch {
    throw invalidUrl();
  }
  if (!['http:', 'https:'].includes(url.protocol) || !SUPPORTED_HOSTS.has(url.hostname.toLowerCase())) {
    throw invalidUrl();
  }

  const host = url.hostname.toLowerCase();
  let candidate = null;
  if (host === 'youtu.be' || host === 'www.youtu.be') {
    candidate = url.pathname.split('/').filter(Boolean)[0];
  } else if (url.pathname === '/watch') {
    candidate = url.searchParams.get('v');
  } else {
    const parts = url.pathname.split('/').filter(Boolean);
    if (['shorts', 'embed', 'live', 'v'].includes(parts[0])) candidate = parts[1];
  }

  if (!candidate || !VIDEO_ID_PATTERN.test(candidate)) throw invalidUrl();
  return candidate;
}

module.exports = { extractYouTubeVideoId };
