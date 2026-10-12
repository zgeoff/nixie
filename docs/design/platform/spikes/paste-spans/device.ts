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
const html = `<!doctype html><meta name="viewport" content="width=device-width">
<button id="copy">copy</button><textarea rows="4" style="width:95%;font-size:20px"></textarea>
<pre id="log" style="font-size:10px;white-space:pre-wrap"></pre><script>${script}</script>`;

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
