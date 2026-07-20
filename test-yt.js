const { YoutubeTranscript } = require('youtube-transcript');

async function test() {
  try {
    const res = await YoutubeTranscript.fetchTranscript('fYyARMqiaag');
    console.log('Success with youtube-transcript, segments:', res.length);
  } catch (err) {
    console.error('youtube-transcript error:', err.message);
  }
}
test();
