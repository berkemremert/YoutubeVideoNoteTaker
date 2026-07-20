const fs = require('fs');
async function test() {
    const fetch = (await import('node-fetch')).default || global.fetch;
    const res = await fetch('https://www.youtube.com/api/timedtext?v=dQw4w9WgXcQ&ei=5EheasqHHv2hi9oPk5uM-AQ&caps=asr&opi=112496729&xoaf=5&xowf=1&hl=en&ip=0.0.0.0&ipbits=0&expire=1784589140&sparams=ip%2Cipbits%2Cexpire%2Cv%2Cei%2Ccaps%2Copi%2Cxoaf&signature=4F13B4F9023DB03EEE9B84A0328C0BD39A46BDE6.868AF02C36EA22170254BB25CEE25923D6F42C0B&key=yt8&lang=en&fmt=json3');
    const capData = await res.json();
    const events = capData?.events;
    
    if (!events || events.length === 0) {
      console.log('NO_CAPTIONS');
      return;
    }
  
    // Extract text segments
    const segments = events
      .filter(e => e.segs)
      .map(e => e.segs.map(s => s.utf8).join(''))
      .filter(t => t.trim());
      
    console.log(segments.join(' ').substring(0, 100));
}
test();
