import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startCheckingProxy } from '@heynixie/egress';
import { chromium } from 'playwright-core';
import { launchBrowser } from './launch-browser';
import { makeScanGate } from './make-scan-gate';

const hasChromium = await chromium.launch({ headless: true }).then(
  async (browser) => {
    await browser.close();

    return true;
  },
  () => false,
);

async function setupTest() {
  const folder = await mkdtemp(join(tmpdir(), 'launch-browser-'));

  const key = join(folder, 'key.pem');
  const cert = join(folder, 'cert.pem');

  const generated = Bun.spawnSync(
    `openssl req -x509 -newkey rsa:2048 -nodes -keyout ${key} -out ${cert} -days 1 -subj /CN=pages.test`.split(
      ' ',
    ),
    { stdout: 'ignore', stderr: 'ignore' },
  );

  expect(generated.exitCode).toBe(0);

  const received: { header: string | null; body: string }[] = [];

  const site = Bun.serve({
    hostname: '127.0.0.1',
    port: 0,
    tls: { key: Bun.file(key), cert: Bun.file(cert) },
    routes: {
      '/': new Response('<html><body>ready</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      '/up': {
        POST: async (request) => {
          received.push({ header: request.headers.get('x-note'), body: await request.text() });

          return new Response('ok');
        },
      },
    },
  });

  const scannedTexts: string[] = [];
  const gate = makeScanGate();

  gate.current = {
    askScan: () => Promise.resolve(),
    askScanText: (text) => {
      scannedTexts.push(text);

      return text.includes('synthetic-secret')
        ? Promise.reject(new Error('refused'))
        : Promise.resolve();
    },
  };

  const proxy = await startCheckingProxy({
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    scanURL: gate.scan,
    scanText: gate.scanText,
    canTunnel: true,
  });

  const state = await launchBrowser({ home: join(folder, 'browser'), proxyPort: proxy.port, gate });

  onTestFinished(async () => {
    await state.context.close();
    await proxy.stop();
    await site.stop(true);

    await rm(folder, { recursive: true, force: true });
  });

  const page = await state.context.newPage();
  const cdp = await state.context.newCDPSession(page);

  await cdp.send('Security.setIgnoreCertificateErrors', { ignore: true });
  await page.goto(`https://pages.test:${String(site.port)}/`);

  return { page, received, scannedTexts };
}

test.skipIf(!hasChromium)(
  'it stops an HTTPS request that carries a secret in a header and a body',
  async () => {
    const ctx = await setupTest();

    const outcome = await ctx.page.evaluate(() =>
      fetch('/up', {
        method: 'POST',
        headers: { 'X-Note': 'synthetic-secret' },
        body: 'synthetic-secret',
      }).then(
        () => 'sent',
        () => 'blocked',
      ),
    );

    expect({ outcome, received: ctx.received }).toStrictEqual({ outcome: 'blocked', received: [] });
  },
);

test.skipIf(!hasChromium)(
  'it scans the headers and body of an HTTPS request that passes',
  async () => {
    const ctx = await setupTest();

    await ctx.page.evaluate(() =>
      fetch('/up', { method: 'POST', headers: { 'X-Note': 'hello' }, body: 'plain body' }),
    );

    expect(ctx.received).toStrictEqual([{ header: 'hello', body: 'plain body' }]);
    expect(ctx.scannedTexts).toSatisfyAny((text: string) => text.endsWith('\n\nplain body'));
  },
);
