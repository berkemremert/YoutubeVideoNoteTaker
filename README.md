# YouTube Video Note Taker

A powerful, AI-driven web application that automatically extracts transcripts from YouTube videos and generates high-quality, structured notes. It supports advanced features such as automatic fallback to audio transcription (using Groq Whisper) when captions are unavailable, and intelligently bypasses YouTube bot detection.

## Features

- **Automated Note Generation**: Converts YouTube videos into structured Markdown notes instantly.
- **Multiple Output Styles**: Generate detailed notes, executive summaries, bullet-point lists, or study guides based on your needs.
- **Advanced Transcript Extraction**: Uses `yt-dlp` to fetch accurate subtitle tracks natively.
- **Audio Transcription Fallback**: If a video lacks captions, the app automatically downloads the audio and transcribes it using the Groq Whisper API.
- **Bot Detection Bypass**: Implements Android, iOS, and Web client spoofing, with an optional YouTube cookies fallback to reliably bypass datacenter IP bans.
- **Reasoning Model Support**: Optimized for advanced AI models (e.g., DeepSeek) with built-in filters to strip raw "chain of thought" output from the final notes.

## Architecture

- **Backend**: Node.js and Express.js
- **Transcript Extraction**: `youtube-dl-exec` (a wrapper around `yt-dlp`)
- **AI Processing**: 
  - **Text Generation**: Fireworks AI API (supports models like DeepSeek V4 Pro, GPT OSS, etc.)
  - **Audio Transcription**: Groq API (Whisper-large-v3)
- **Frontend**: Vanilla HTML/CSS/JS (served statically via Express)

## Prerequisites

- Node.js (v18 or higher recommended)
- A Fireworks AI API Key
- A Groq API Key (required for the audio transcription fallback)

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/berkemremert/YoutubeVideoNoteTaker.git
   cd YoutubeVideoNoteTaker
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Configure Environment Variables:
   Create a `.env` file in the root directory and add your API keys:
   ```env
   FIREWORKS_API_KEY=your_fireworks_api_key_here
   GROQ_API_KEY=your_groq_api_key_here
   PORT=3000
   ```

## Usage

### Running Locally

Start the development server using nodemon:
```bash
npm run dev
```
Or start it normally:
```bash
npm start
```
Navigate to `http://localhost:3000` in your browser.

### Using the Application

1. Paste a valid YouTube URL into the input field.
2. Select your desired note style (Detailed, Summary, Bullets, Study).
3. Select your AI model and effort level.
4. Click "Generate Notes" and wait for the AI to process the video.

## Advanced Configuration: YouTube Bot Bypass

If you deploy this application to a cloud provider (e.g., Render, AWS, Heroku), YouTube may block requests with a "Sign in to confirm you are not a bot" error. The application includes a fallback mechanism:

1. Export your YouTube cookies using a browser extension (e.g., "Get cookies.txt LOCALLY").
2. Copy the entire content of the exported `.txt` file.
3. Add a new environment variable named `YOUTUBE_COOKIES` to your deployment environment and paste the cookies as the value.

The server will automatically detect this variable, write it to a secure temporary file, and use it for all subsequent extractions, completely bypassing the block.

## License

This project is open-source and available under the MIT License.
