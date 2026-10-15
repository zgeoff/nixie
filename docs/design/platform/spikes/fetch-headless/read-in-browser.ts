// Reads one page in headless Chromium behind the checking proxy, waits for a bot challenge to
// clear, and prints one line of JSON: timings, statuses, sizes, the cgroup's peak memory, the
// proxy's tunnels and a title sample of at most 60 characters. It never prints the page's text.
//   bun read-in-browser.ts <url> <plain|masked> [deadline ms]
import { readFile } from 'node:fs/promises';
import type { Response } from 'playwright-core';
import type { BrowserVariant } from './start-browser';
import { engine, getUserAgent, startBrowser } from './start-browser';
import { startCheckingProxy } from './start-checking-proxy';

const [url = '', variantText = 'plain', deadlineText = '30000'] = process.argv.slice(2);
const variant = variantText as BrowserVariant;
const deadlineMs = Number(deadlineText);

const started = performance.now();
const elapsed = () => Math.round(performance.now() - started);

// memory.peak counts the page cache that reading Chromium's files fills, so a sampler also keeps
// the peak of anonymous memory, the part a fetch cannot give back
const anon = { peakMiB: 0 };
const sampler = setInterval(() => {
  void readAnonMemoryMiB().then((mib) => {
    anon.peakMiB = Math.max(anon.peakMiB, mib ?? 0);
  });
}, 200);

const proxy = await startCheckingProxy([]);
const browser = await startBrowser({ variant, proxyPort: proxy.port });
const launchMs = elapsed();

const userAgent = getUserAgent(variant);
const context = await browser.newContext({
  ...(userAgent === undefined ? {} : { userAgent }),
  viewport: { width: 1280, height: 800 },
  locale: 'en-US',
});
const page = await context.newPage();

// every main-frame document response, the challenge pages and the page after them
const documents: { status: number; mitigated: string | null; atMs: number }[] = [];

page.on('response', (response: Response) => {
  if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) {
    documents.push({
      status: response.status(),
      mitigated: response.headers()['cf-mitigated'] ?? null,
      atMs: elapsed(),
    });
  }
});

const navigation = await page
  .goto(url, { waitUntil: 'domcontentloaded', timeout: deadlineMs })
  .then(() => null)
  .catch((error: unknown) => (error instanceof Error ? error.message.split('\n')[0] : 'failed'));

const result = await waitForPage(navigation);
const peakMemoryMiB = await readPeakMemoryMiB();

clearInterval(sampler);

console.log(
  JSON.stringify({
    url,
    engine,
    variant,
    launchMs,
    totalMs: elapsed(),
    ...result,
    documents,
    peakMemoryMiB,
    peakAnonMiB: anon.peakMiB,
    egressKiB: Math.round((proxy.bytes.up + proxy.bytes.down) / 1024),
    tunnels: proxy.tunnels.filter((tunnel) => tunnel.decision === 'connect').length,
    refused: proxy.tunnels.filter((tunnel) => tunnel.decision === 'refused'),
    hosts: [...new Set(proxy.tunnels.map((tunnel) => tunnel.host))],
  }),
);

await browser.close();
proxy.stop();
process.exit(0);

interface PageResult {
  readonly passed: boolean;
  readonly passMs: number | null;
  readonly challenge: string | null;
  readonly htmlKiB: number | null;
  readonly textChars: number | null;
  readonly title: string | null;
  readonly error: string | null;
}

// polls the page until it holds no challenge and a 2xx document with text, or the deadline passes
async function waitForPage(navigationError: string | null): Promise<PageResult> {
  const state = { challenge: null as string | null, error: navigationError };

  while (elapsed() < deadlineMs) {
    // oxlint-disable-next-line no-await-in-loop -- each poll reads the page as it now stands
    const seen = await page.evaluate(findChallengeInPage).catch(() => null);
    const last = documents.at(-1);

    if (seen !== null) {
      state.challenge = seen.challenge ?? state.challenge;

      if (seen.challenge === null && last !== undefined && last.status < 300 && seen.text > 200) {
        // oxlint-disable-next-line no-await-in-loop -- one read, once the page has passed
        return { ...(await readSizes()), passed: true, passMs: elapsed(), challenge: state.challenge, error: null };
      }
    }

    // oxlint-disable-next-line no-await-in-loop -- the poll interval
    await Bun.sleep(500);
  }

  const sizes = await readSizes().catch(() => ({ htmlKiB: null, textChars: null, title: null }));

  return { ...sizes, passed: false, passMs: null, challenge: state.challenge, error: state.error };
}

// runs in the page: the challenge vendor the page shows, and the length of its visible text
function findChallengeInPage(): { challenge: string | null; text: number } {
  const html = document.documentElement.outerHTML;
  const text = document.body?.innerText.length ?? 0;

  // not /cdn-cgi/challenge-platform/ alone: Cloudflare injects that beacon into pages that passed
  if (
    document.title.startsWith('Just a moment') ||
    html.includes('_cf_chl_opt') ||
    location.search.includes('__cf_chl')
  ) {
    return { challenge: 'cloudflare', text };
  }

  if (html.includes('captcha-delivery.com') || html.includes('geo.captcha-delivery')) {
    return { challenge: 'datadome', text };
  }

  if (html.includes('px-captcha') || document.title.startsWith('Access to this page has been denied')) {
    return { challenge: 'perimeterx', text };
  }

  return { challenge: null, text };
}

async function readSizes(): Promise<Pick<PageResult, 'htmlKiB' | 'textChars' | 'title'>> {
  const html = await page.content();
  const text = await page.evaluate(() => document.body?.innerText.length ?? 0);
  const title = await page.title();

  return { htmlKiB: Math.round(html.length / 1024), textChars: text, title: title.slice(0, 60) };
}

// the container's peak memory, from cgroup v2; null outside a container
async function readPeakMemoryMiB(): Promise<number | null> {
  const peak = await readFile('/sys/fs/cgroup/memory.peak', 'utf8').catch(() => null);

  return peak === null ? null : Math.round(Number(peak) / 1_048_576);
}

// the container's anonymous and kernel memory now, from cgroup v2's memory.stat
async function readAnonMemoryMiB(): Promise<number | null> {
  const stat = await readFile('/sys/fs/cgroup/memory.stat', 'utf8').catch(() => null);

  if (stat === null) {
    return null;
  }

  const fields = new Map(stat.split('\n').map((line) => line.split(' ') as [string, string]));

  return Math.round((Number(fields.get('anon') ?? 0) + Number(fields.get('kernel') ?? 0)) / 1_048_576);
}
