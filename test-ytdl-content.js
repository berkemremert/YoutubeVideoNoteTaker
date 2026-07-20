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
    
    let subUrl = null;
    let format = null;

    if (output.subtitles && output.subtitles['en']) {
      const enSubs = output.subtitles['en'];
      const json3 = enSubs.find(s => s.ext === 'json3');
      const vtt = enSubs.find(s => s.ext === 'vtt');
      if (json3) { subUrl = json3.url; format = 'json3'; }
      else if (vtt) { subUrl = vtt.url; format = 'vtt'; }
    } else if (output.automatic_captions && output.automatic_captions['en']) {
      const enSubs = output.automatic_captions['en'];
      const json3 = enSubs.find(s => s.ext === 'json3');
      const vtt = enSubs.find(s => s.ext === 'vtt');
      if (json3) { subUrl = json3.url; format = 'json3'; }
      else if (vtt) { subUrl = vtt.url; format = 'vtt'; }
    }

    console.log('Sub URL:', subUrl, 'Format:', format);
    
    if (subUrl) {
      const fetch = (await import('node-fetch')).default || global.fetch;
      const res = await fetch(subUrl);
      const text = await res.text();
      console.log('Downloaded length:', text.length);
      console.log('First 100 chars:', text.substring(0, 100));
    }

  } catch (err) {
    console.error(err);
  }
}
test();
