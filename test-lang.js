const youtubedl = require('youtube-dl-exec');

async function test() {
  const output = await youtubedl(`https://www.youtube.com/watch?v=sU14z70lG2E`, {
    dumpJson: true,
    skipDownload: true,
    subLangs: 'all', // Ensure we fetch all lang info
    writeAutoSubs: true,
    writeSubs: true,
  });

  const subs = output.subtitles || {};
  const autoSubs = output.automatic_captions || {};

  console.log('Available manual subs:', Object.keys(subs));
  console.log('Available auto subs:', Object.keys(autoSubs));
}
test();
