const fs = require('fs');
const { OpenAI } = require('openai');
const youtubedl = require('youtube-dl-exec');
require('dotenv').config();

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY,
  baseURL: 'https://api.groq.com/openai/v1',
});

async function test() {
  const videoId = '2QmuhAvJuLE';
  const tmpFilePath = `./${videoId}.m4a`;
  
  console.log('Downloading...');
  await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
    format: 'bestaudio[ext=m4a]/bestaudio',
    output: tmpFilePath,
  });
  
  console.log('File size:', fs.statSync(tmpFilePath).size);
  
  console.log('Transcribing...');
  const res = await groq.audio.transcriptions.create({
    file: fs.createReadStream(tmpFilePath),
    model: 'whisper-large-v3',
  });
  console.log('Transcript length:', res.text.length);
  console.log('Transcript text:', res.text);
}
test().catch(console.error);
