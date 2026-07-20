const youtubedl = require('youtube-dl-exec');

async function test() {
  try {
    const output = await youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
      dumpJson: true,
      skipDownload: true,
      subLangs: 'en.*',
      writeAutoSubs: true,
      writeSubs: true,
    });
    
    // Let's see if subtitles are available in the JSON dump
    if (output.subtitles && Object.keys(output.subtitles).length > 0) {
      console.log('Subs:', Object.keys(output.subtitles));
    } else if (output.automatic_captions && Object.keys(output.automatic_captions).length > 0) {
      console.log('Auto Subs:', Object.keys(output.automatic_captions));
      // Try to fetch the URL for the first en subtitle
      const enSubs = output.automatic_captions['en'] || output.automatic_captions['en-orig'];
      if (enSubs && enSubs.length > 0) {
          const json3 = enSubs.find(s => s.ext === 'json3');
          if (json3) console.log('Found json3 URL:', json3.url);
      }
    } else {
      console.log('No subs found in the dump.');
    }
  } catch (err) {
    console.error(err);
  }
}
test();
