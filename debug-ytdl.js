const youtubedl = require('youtube-dl-exec');
const videoId = 'dQw4w9WgXcQ'; // Replace with the video ID the user tried if needed

async function test() {
  try {
    const output = await youtubedl(`https://www.youtube.com/watch?v=${videoId}`, {
      dumpJson: true,
      skipDownload: true,
      subLangs: 'en.*',
      writeAutoSubs: true,
      writeSubs: true,
    });

    let subUrl = null;

    // Prefer manual subtitles over auto-generated ones
    const subs = output.subtitles || {};
    const autoSubs = output.automatic_captions || {};

    const enSubs = subs['en'] || subs['en-US'] || subs['en-GB'] || 
                   autoSubs['en'] || autoSubs['en-US'] || autoSubs['en-orig'];

    if (!enSubs || enSubs.length === 0) {
      console.log('NO_CAPTIONS - enSubs is empty');
      return;
    }

    // Find json3 format which contains the easiest to parse text structure
    const json3 = enSubs.find(s => s.ext === 'json3');
    if (json3) {
      subUrl = json3.url;
    } else {
      console.log('NO_CAPTIONS - no json3 found');
      return;
    }

    // Fetch the actual subtitle data
    const fetch = (await import('node-fetch')).default || global.fetch;
    const capRes = await fetch(subUrl);
    if (!capRes.ok) {
      console.log('CAPTION_FETCH_FAILED');
      return;
    }

    const capData = await capRes.json();
    const events = capData?.events;

    if (!events || events.length === 0) {
      console.log('NO_CAPTIONS - events empty');
      return;
    }

    // Extract text segments
    const segments = events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8).join(''))
      .filter(t => t.trim());

    if (segments.length === 0) {
      console.log('NO_CAPTIONS - segments empty');
      return;
    }

    console.log('Success!', segments.length, 'segments');
  } catch (err) {
    console.error('Error:', err);
  }
}
test();
