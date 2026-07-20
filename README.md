# YouTube Video Note Taker

YouTube Video Note Taker turns a captioned YouTube video into structured Markdown notes. The Express server retrieves transcripts through SerpApi's YouTube Video Transcript API, normalizes and caches them, and sends transcript text to Fireworks AI. The browser never receives either provider key.

The application does not download audio or video, use cookies, scrape YouTube, or call YouTube caption endpoints directly.

## Architecture

- Frontend: vanilla HTML, CSS, and JavaScript in `public/`
- API: Node.js 20+ and Express, using CommonJS modules
- Transcript provider: SerpApi `youtube_video_transcript`
- Note provider: Fireworks AI through its OpenAI-compatible API
- Cache: bounded in-memory TTL cache with concurrent request deduplication
- Tests: built-in Node.js test runner with mocked upstream requests

The in-memory cache is intentionally replaceable. It reduces repeated calls within one Render process but is cleared by restarts and is not shared between multiple instances.

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies:

   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and add keys:

   ```dotenv
   PORT=3000
   SERPAPI_API_KEY=your_server_side_serpapi_key
   FIREWORKS_API_KEY=your_fireworks_key
   ```

Create a SerpApi account and obtain an API key for the YouTube Video Transcript API. Create a Fireworks AI account and obtain an API key for note generation. Never put either value in `public/`, frontend JavaScript, screenshots, or committed files.

4. Start the app:

   ```bash
   npm run dev
   ```

Open `http://localhost:3000`.

## Configuration

| Variable | Default | Purpose |
|---|---:|---|
| `PORT` | `3000` | HTTP port |
| `SERPAPI_API_KEY` | none | Required in production for transcripts |
| `SERPAPI_TIMEOUT_MS` | `20000` | Per-attempt provider timeout |
| `SERPAPI_MAX_RETRIES` | `1` | Retries for transient failures only |
| `SERPAPI_CACHE_TTL_MS` | `86400000` | Successful transcript cache lifetime |
| `SERPAPI_CACHE_MAX_ENTRIES` | `500` | In-memory cache bound |
| `DEFAULT_TRANSCRIPT_LANGUAGE` | `en` | Deterministic default transcript language |
| `TRANSCRIPT_REQUEST_LIMIT_WINDOW_MS` | `900000` | Rate-limit window |
| `TRANSCRIPT_REQUEST_LIMIT_MAX` | `10` | Requests per IP per window |
| `FIREWORKS_API_KEY` | none | Required in production for note generation |

Invalid numeric configuration prevents startup. Production also refuses to start without both provider keys.

## API

### Generate notes

`POST /api/generate-notes`

```json
{
  "url": "https://www.youtube.com/watch?v=2QmuhAvJuLE",
  "languageCode": "en",
  "style": "detailed",
  "model": "accounts/fireworks/models/deepseek-v4-pro",
  "effort": "standard"
}
```

The `languageCode` is optional. URLs using watch, `youtu.be`, Shorts, embed, and live formats are accepted, as are raw 11-character video IDs.

Successful response:

```json
{
  "success": true,
  "videoId": "2QmuhAvJuLE",
  "videoUrl": "https://www.youtube.com/watch?v=2QmuhAvJuLE",
  "wordCount": 1532,
  "notes": "## Key Takeaways\n...",
  "transcript": {
    "languageCode": "en",
    "requestedLanguageCode": "en",
    "type": "asr",
    "segmentCount": 245,
    "chapters": []
  }
}
```

Error response:

```json
{
  "success": false,
  "error": {
    "code": "TRANSCRIPT_UNAVAILABLE",
    "message": "No transcript is available for this video.",
    "requestId": "..."
  }
}
```

Common error codes include `INVALID_YOUTUBE_URL`, `TRANSCRIPT_UNAVAILABLE`, `TRANSCRIPT_SERVICE_CONFIGURATION_ERROR`, `TRANSCRIPT_SERVICE_LIMIT_REACHED`, `TRANSCRIPT_SERVICE_TIMEOUT`, `TRANSCRIPT_SERVICE_ERROR`, `NOTE_GENERATION_FAILED`, and `RATE_LIMIT_EXCEEDED`.

### Health check

`GET /health` reports process health and safe provider-configuration booleans. It does not call SerpApi or Fireworks.

## Tests

```bash
npm test
```

The default suite makes no live SerpApi, Fireworks, or YouTube calls. Fixtures cover URL parsing, language fallback, response normalization, empty transcripts, provider authentication/quota errors, retry policy, caching, concurrent deduplication, note generation, and route contracts.

## Render deployment

- Build command: `npm ci`
- Start command: `npm start`
- Runtime: Node.js 20 or newer
- Required secrets: `SERPAPI_API_KEY`, `FIREWORKS_API_KEY`
- Recommended: configure the timeout, retry, cache, default-language, and rate-limit variables listed above
- Health-check path: `/health`

Configure secrets only in the Render dashboard. Do not use a local file as a production cache; Render instances can restart or scale horizontally.

SerpApi allowances and pricing are limited and can change. Review the current SerpApi plan before a production launch. This app conserves searches with input validation, deterministic parameters, a 24-hour application cache, request deduplication, and per-IP rate limiting; SerpApi's own cache remains enabled because the app does not send `no_cache=true`.

## Security history

An `.env` file existed in the repository's Git history. Any keys that were stored in that file should be rotated. `.env` and media files are now ignored, while `.env.example` contains placeholders only.
