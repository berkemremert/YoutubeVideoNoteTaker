class TranscriptCache {
  constructor({ maxEntries = 500, now = () => Date.now() } = {}) {
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  get(key) {
    const entry = this.entries.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return null;
    }
    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.value);
  }

  set(key, value, ttlMs) {
    if (this.entries.has(key)) this.entries.delete(key);
    while (this.entries.size >= this.maxEntries) {
      this.entries.delete(this.entries.keys().next().value);
    }
    this.entries.set(key, {
      value: structuredClone(value),
      expiresAt: this.now() + ttlMs,
    });
  }

  delete(key) {
    this.entries.delete(key);
  }

  clear() {
    this.entries.clear();
  }
}

function createTranscriptCacheKey({ videoId, languageCode, transcriptType, transcriptTitle }) {
  return [
    'transcript',
    videoId,
    languageCode.toLowerCase(),
    transcriptType || 'default',
    transcriptTitle || 'default',
  ].join(':');
}

module.exports = { TranscriptCache, createTranscriptCacheKey };
