const { OpenAI } = require('openai');
const fs = require('fs');
require('dotenv').config();

const ai = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

// Create a dummy text file and pretend it's audio to see the error message
fs.writeFileSync('dummy.mp3', 'dummy');

async function test() {
  try {
    const res = await ai.audio.transcriptions.create({
      file: fs.createReadStream('dummy.mp3'),
      model: 'whisper-v3',
    });
    console.log('Success:', res);
  } catch (err) {
    console.error('Error:', err.message, err.response?.data);
  }
}
test();
