async function test() {
  try {
    const { Innertube } = await import('youtubei.js');
    const youtube = await Innertube.create();
    const info = await youtube.getInfo('dQw4w9WgXcQ');
    const transcriptData = await info.getTranscript();
    console.log(transcriptData.transcript.content.body.initial_segments.slice(0, 5).map(s => s.snippet.text));
  } catch (err) {
    console.error(err);
  }
}
test();
