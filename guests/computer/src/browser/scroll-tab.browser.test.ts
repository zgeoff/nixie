import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerReplySchema } from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { makeStubDriver } from '../screen/make-stub-driver';
import { makeBrowserHandler } from './make-browser-handler';

const hasChromium = await chromium.launch({ headless: true }).then(
  async (browser) => {
    await browser.close();

    return true;
  },
  () => false,
);

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'scroll-'));

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': new Response(
        '<html><title>Long</title><body><div style="height:3000px">tall</div></body></html>',
        {
          headers: { 'Content-Type': 'text/html' },
        },
      ),
    },
  });

  const handle = makeBrowserHandler({
    home,
    deniedRanges: [],
    timeZone: 'UTC',
    isHeadless: true,
    gate: { scan: () => Promise.resolve(), scanText: () => Promise.resolve() },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    screen: { makeDriver: (state) => makeStubDriver(state.tabs), settleMs: 50 },
  });

  onTestFinished(async () => {
    await site.stop(true);

    await rm(home, { recursive: true, force: true });
  });

  const send = (request: Parameters<typeof handle>[0]) =>
    handle(
      request,
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

  return {
    send,
    openLongPage: () =>
      send({
        op: 'open',
        url: `http://pages.test:${String(site.port)}/`,
        limits: {
          bodyBytes: 1_000_000,
          timeoutMs: 20_000,
          redirects: 5,
          textBytes: 20_000,
          imageBytes: 0,
        },
        deniedRanges: [],
      }),
  };
}

test.skipIf(!hasChromium)(
  'it reports isAtEnd only at the end of a long page and stores no page',
  async () => {
    const ctx = await setupTest();

    await ctx.openLongPage();

    const replies = [];

    for (let step = 0; step < 4; step += 1) {
      const reply = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });

      replies.push(reply);
    }

    const up = await ctx.send({ op: 'scroll', tab: 't1', to: 'up' });

    expect(replies.map((reply) => reply.kind === 'scroll' && reply.isAtEnd)).toStrictEqual([
      false,
      false,
      false,
      true,
    ]);

    expect(up).toMatchObject({ kind: 'scroll', isAtEnd: false });
    expect(computerReplySchema.safeParse(replies[3]).success).toBe(true);

    expect(replies[3]).toStrictEqual({
      kind: 'scroll',
      ok: true,
      tab: 't1',
      url: expect.stringContaining('pages.test'),
      width: 1280,
      height: 800,
      isAtEnd: true,
      base64: expect.stringMatching(/^iVBORw0KGgo/u),
    });
  },
);
