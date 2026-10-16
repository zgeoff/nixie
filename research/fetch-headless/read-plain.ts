// Reads one page with the fetcher's own readPage, at its default limits, and prints one JSON line
// with the same measures as read-in-browser.ts, so the two costs compare on the same page. A
// binary page has no text, so its textChars is null.
//   bun read-plain.ts <url>
import { readFile } from 'node:fs/promises';
import { makeAddressCheck } from '../../guests/fetch/src/make-address-check';
import { readPage } from '../../guests/fetch/src/read-page';
import { resolveHostAddresses } from '../../guests/fetch/src/resolve-host-addresses';

const [url = ''] = process.argv.slice(2);
const started = performance.now();

const reply = await readPage(url, {
  limits: { bodyBytes: 2_097_152, timeoutMs: 15_000, redirects: 5, textBytes: 262_144 },
  checkAddress: makeAddressCheck([]),
  resolveHost: resolveHostAddresses,
});

const totalMs = Math.round(performance.now() - started);
const peak = await readFile('/sys/fs/cgroup/memory.peak', 'utf8').catch(() => null);

console.log(
  JSON.stringify({
    url,
    engine: 'plain fetch',
    totalMs,
    kind: reply.kind,
    ...(reply.kind === 'page'
      ? { status: reply.status, blocked: reply.blocked ?? null, textChars: reply.text?.length ?? null }
      : { reason: reply.reason }),
    peakMemoryMiB: peak === null ? null : Math.round(Number(peak) / 1_048_576),
  }),
);
