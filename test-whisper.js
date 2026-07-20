const fs = require('fs');
const { OpenAI } = require('openai');
require('dotenv').config();

const ai = new OpenAI({
  apiKey: process.env.FIREWORKS_API_KEY,
  baseURL: 'https://api.fireworks.ai/inference/v1',
});

async function test() {
  try {
    const models = await ai.models.list();
    const whisperModels = models.data.filter(m => m.id.toLowerCase().includes('whisper') || m.id.toLowerCase().includes('audio'));
    console.log('Audio Models:', whisperModels.map(m => m.id));
  } catch(e) {
    console.error(e);
  }
}
test();
