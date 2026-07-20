const { fetchTranscript } = require('./server.js');

async function test() {
  try {
    const data = await fetchTranscript('dQw4w9WgXcQ');
    console.log('Success! Got', data.length, 'segments');
  } catch (err) {
    console.error('FAILED:', err.message, err.stack);
  }
}

test();
