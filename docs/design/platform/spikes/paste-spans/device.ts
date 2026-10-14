// Serves the capture page to a phone and appends each event the page posts to a log file, one JSON
// object per line.
// Usage: bun device.ts <log file> [port]
import { appendFile } from 'node:fs/promises';

const logPath = process.argv[2];
const port = Number(process.argv[3] ?? 4263);

if (logPath === undefined) {
  throw new Error('usage: bun device.ts <log file> [port]');
}

const built = await Bun.build({ entrypoints: [`${import.meta.dir}/page.ts`], target: 'browser' });
const script = await built.outputs[0]?.text();
// The page turns off text autosizing, so the layout holds still as the log grows and a tap at a
// fixed point keeps landing in the text box.
const html = `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
<body style="text-size-adjust:none;-webkit-text-size-adjust:none">
<div id="step" style="font-size:16px"></div>
<button id="copy" style="font-size:20px">copy</button> <button id="next" style="font-size:20px">next</button>
<textarea rows="4" style="width:95%;font-size:20px"></textarea>
<pre id="log" style="font-size:10px;white-space:pre-wrap;user-select:none"></pre>
<script>${script}</script></body>`;

Bun.serve({
  hostname: '0.0.0.0',
  port,
  async fetch(request) {
    if (request.method === 'POST') {
      await appendFile(logPath, `${await request.text()}\n`);
      return new Response(null, { status: 204 });
    }
    return new Response(html, { headers: { 'content-type': 'text/html' } });
  },
});
console.log(`serving on port ${port}, logging to ${logPath}`);
