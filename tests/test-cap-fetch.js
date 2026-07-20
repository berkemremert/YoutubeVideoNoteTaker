const youtubedl = require('youtube-dl-exec');
async function test() {
  const output = await youtubedl('https://www.youtube.com/watch?v=dQw4w9WgXcQ', {
    dumpJson: true, skipDownload: true, subLangs: 'all', writeAutoSubs: true, writeSubs: true,
  });
  const subs = output.subtitles || {};
  const autoSubs = output.automatic_captions || {};
  
  const getEn = (t) => t['en'] || t['en-US'];
  const getFirst = (t) => Object.keys(t).length > 0 ? t[Object.keys(t)[0]] : null;

  const selectedTrack = getEn(subs) || getEn(autoSubs) || getFirst(subs) || getFirst(autoSubs);
  const json3 = selectedTrack.find(s => s.ext === 'json3');
  
  console.log("Fetching URL:", json3.url);
  const capRes = await fetch(json3.url);
  console.log("Status:", capRes.status, capRes.statusText);
}
test();
