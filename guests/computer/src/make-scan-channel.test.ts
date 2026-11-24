import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerGuestFrame, ComputerRequest } from '@heynixie/wire';
import {
  decodeComputerGuestFrame,
  encodeComputerMessage,
  encodeFrame,
  makeFrameDecoder,
  runComputerGuest,
} from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { makeBrowserHandler } from './browser/make-browser-handler';
import { makeComputerHandler } from './make-computer-handler';
import { makeScanChannel } from './make-scan-channel';

const hasChromium = await chromium
  .launch({ headless: true })
  .catch(() => null)
  .then(async (browser) => {
    if (browser === null) {
      return false;
    }

    await browser.close();

    return true;
  });

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'computer-'));

  onTestFinished(() => rm(home, { recursive: true, force: true }));

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': new Response(
        `<html><title>waiting</title><body>page<script>
          setTimeout(() => {
            fetch('/beacon', { method: 'POST', body: 'synthetic-secret' }).then(
              () => { document.title = 'sent'; },
              () => { document.title = 'blocked'; },
            );
          }, 1500);
        </script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
    },
  });

  onTestFinished(() => site.stop(true));

  const channel = makeScanChannel();

  const inbound = new TransformStream<Uint8Array, Uint8Array>();

  const writer = inbound.writable.getWriter();
  const decode = makeFrameDecoder(10_000_000);
  const frames: ComputerGuestFrame[] = [];
  const waiting: (() => void)[] = [];

  const send = (
    message: ComputerRequest | { kind: 'hop-pass' } | { kind: 'hop-refuse'; reason: string },
  ) => writer.write(encodeFrame(encodeComputerMessage(message)));

  const answerHop = (frame: ComputerGuestFrame): void => {
    if (frame.kind !== 'hop' && frame.kind !== 'hop-content') {
      return;
    }

    const text = frame.kind === 'hop' ? frame.url : frame.text;
    const isSecret = text.includes('synthetic-secret');

    const answer = isSecret
      ? { kind: 'hop-refuse' as const, reason: 'holds a secret' }
      : { kind: 'hop-pass' as const };

    void send(answer);
  };

  const running = runComputerGuest(
    {
      input: inbound.readable,
      write: (bytes) => {
        for (const message of decode(bytes)) {
          const frame = decodeComputerGuestFrame(message);

          frames.push(frame);

          answerHop(frame);
        }

        for (const wake of waiting.splice(0)) {
          wake();
        }

        return Promise.resolve();
      },
    },
    makeComputerHandler({
      browser: makeBrowserHandler({
        home,
        gate: channel,
        resolveHost: () => Promise.resolve(['127.0.0.1']),
        checkAddress: () => true,
        timeZone: 'UTC',
        deniedRanges: [],
        isHeadless: true,
      }),
      shell: () => Promise.resolve({ kind: 'closed', ok: true }),
    }),
    10_000_000,
    { onReady: channel.bind },
  );

  onTestFinished(async () => {
    await writer.close();

    await running;
  });

  const waitForFrame = async (isWanted: (frame: ComputerGuestFrame) => boolean): Promise<void> => {
    while (!frames.some((frame) => isWanted(frame))) {
      await new Promise<void>((resolve) => {
        waiting.push(resolve);
      });
    }
  };

  return {
    frames,
    url: `http://pages.test:${String(site.port)}/`,
    send,
    waitForFrame,
    readUntilTitle: async (title: string): Promise<void> => {
      while (!frames.some((frame) => frame.kind === 'page' && frame.page.title === title)) {
        const seen = frames.length;

        await send({ op: 'read', tab: 't1', mode: 'text' });
        await waitForFrame(() => frames.length > seen);
      }
    },
  };
}

test('it refuses a scan before the channel is open', () => {
  const channel = makeScanChannel();

  expect(channel.scan('https://example.org/')).rejects.toThrow('the scan channel is not open');
});

test('it passes each scan to the server once the channel is open', async () => {
  const channel = makeScanChannel();
  const asked: string[] = [];

  channel.bind({
    askScan: (url) => {
      asked.push(`url ${url}`);

      return Promise.resolve();
    },
    askScanText: (text) => {
      asked.push(`text ${text}`);

      return Promise.reject(new Error('holds a secret'));
    },
  });

  await channel.scan('https://example.org/');

  expect(channel.scanText('x-note: tide')).rejects.toThrow('holds a secret');
  expect(asked).toStrictEqual(['url https://example.org/', 'text x-note: tide']);
});

test.skipIf(!hasChromium)(
  'it scans a request a page makes while no call runs, and fails it in the page',
  async () => {
    const ctx = await setupTest();

    await ctx.send({
      op: 'open',
      url: ctx.url,
      limits: {
        bodyBytes: 1_000_000,
        timeoutMs: 20_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    });

    await ctx.waitForFrame((frame) => frame.kind === 'page');

    const framesAtReply = ctx.frames.length;

    await ctx.waitForFrame(
      (frame) => frame.kind === 'hop-content' && frame.text.includes('synthetic-secret'),
    );

    await ctx.readUntilTitle('blocked');

    const afterReply = ctx.frames.slice(framesAtReply);

    const kinds = new Set(afterReply.map((frame) => frame.kind));

    expect([...kinds].toSorted()).toStrictEqual(['hop-content', 'page']);
  },
);
