import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerRequest } from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { makeBrowserHandler } from './make-browser-handler';

const hasChromium = await chromium.launch({ headless: true }).then(
  async (browser) => {
    await browser.close();

    return true;
  },
  () => false,
);

async function setupTest() {
  const home = await mkdtemp(join(tmpdir(), 'browser-'));

  const scanned: string[] = [];

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': new Response(
        `<html><title>Sign up</title><body><h1>Welcome</h1><a href="/terms">Terms</a>
        <form action="/done" method="post"><input name="n" placeholder="Name" />
        <button type="submit">Create account</button></form>
        <form action="http://other.test/post" method="post"><button type="submit">Elsewhere</button></form>
        <a href="/report.txt" download>Download</a></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
      '/terms': new Response('<html><title>Terms</title><body>the terms</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      '/done': new Response('<html><title>Done</title><body>welcome aboard</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      '/report.txt': new Response('report body', {
        headers: { 'Content-Disposition': 'attachment; filename="report.txt"' },
      }),
    },
  });

  const handle = makeBrowserHandler({
    home,
    deniedRanges: [],
    timeZone: 'UTC',
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
  });

  onTestFinished(async () => {
    await site.stop(true);

    await rm(home, { recursive: true, force: true });
  });

  return {
    open: (url: string): ComputerRequest => ({
      op: 'open',
      url,
      limits: {
        bodyBytes: 1_000_000,
        timeoutMs: 20_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    }),
    url: `http://pages.test:${String(site.port)}/`,
    scanned,
    send: (request: ComputerRequest, refuse?: string) =>
      handle(
        request,
        (url) => {
          scanned.push(url);

          return refuse === undefined ? Promise.resolve() : Promise.reject(new Error(refuse));
        },
        () => Promise.resolve(),
      ),
  };
}

test.skipIf(!hasChromium)('it opens a page and numbers its controls and links', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send(ctx.open(ctx.url));

  expect(reply).toMatchObject({
    kind: 'page',
    tab: 't1',
    isDiskNew: true,
    page: { status: 200, title: 'Sign up', links: [`${ctx.url}terms`] },
  });
});

test.skipIf(!hasChromium)('it scans the URL of a navigation before it goes', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  expect(ctx.scanned).toContain(ctx.url);
});

test.skipIf(!hasChromium)('it fails an open whose URL the scan refuses', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send(ctx.open(ctx.url), 'holds a secret');

  expect(reply).toMatchObject({ kind: 'failed', ok: false, reason: 'failed' });
});

test.skipIf(!hasChromium)('it fills a field and submits the form of the page', async () => {
  const ctx = await setupTest();
  const opened = await ctx.send(ctx.open(ctx.url));

  expect(opened).toMatchObject({ page: { text: expect.stringContaining('textbox "Name"') } });

  const reply = await ctx.send({
    op: 'act',
    tab: 't1',
    expectURL: ctx.url,
    acts: [{ kind: 'fill', element: 'E1', value: 'Ada' }],
    submit: false,
  });

  expect(reply).toMatchObject({
    kind: 'page',
    page: { text: expect.stringContaining('value="Ada"') },
  });
});

test.skipIf(!hasChromium)(
  'it keeps the control numbers after a read of the page as text',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));
    await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

    const reply = await ctx.send({
      op: 'act',
      tab: 't1',
      expectURL: ctx.url,
      acts: [{ kind: 'fill', element: 'E1', value: 'Ada' }],
      submit: false,
    });

    expect(reply).toMatchObject({
      kind: 'page',
      page: { text: expect.stringContaining('value="Ada"') },
    });
  },
);

test.skipIf(!hasChromium)(
  'it refuses an act when the page is no longer at the expected URL',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const reply = await ctx.send({
      op: 'act',
      tab: 't1',
      expectURL: `${ctx.url}elsewhere`,
      acts: [{ kind: 'click', element: 'E1' }],
      submit: false,
    });

    expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'page_changed' });
  },
);

test.skipIf(!hasChromium)('it refuses a click on an element that is not on the page', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({
    op: 'act',
    tab: 't1',
    expectURL: ctx.url,
    acts: [{ kind: 'click', element: 'E99' }],
    submit: false,
  });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'stale_element' });
});

test.skipIf(!hasChromium)('it refuses a submit whose form posts to another origin', async () => {
  const ctx = await setupTest();
  const opened = await ctx.send(ctx.open(ctx.url));

  expect(opened).toMatchObject({ page: { text: expect.stringContaining('"Elsewhere"') } });

  const reply = await ctx.send({
    op: 'act',
    tab: 't1',
    expectURL: ctx.url,
    acts: [{ kind: 'click', element: 'E3' }],
    submit: false,
  });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'cross_origin_submit' });
});

test.skipIf(!hasChromium)('it downloads a file a click starts', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({ op: 'download', tab: 't1', element: 'E4' });

  expect(reply).toMatchObject({
    kind: 'file',
    name: 'report.txt',
    base64: Buffer.from('report body').toString('base64'),
  });
});

test.skipIf(!hasChromium)('it answers tab_gone for a tab that was closed', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));
  await ctx.send({ op: 'close', tab: 't1' });

  const reply = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_gone' });
});

test.skipIf(!hasChromium)('it refuses a sixth tab', async () => {
  const ctx = await setupTest();

  for (let tab = 0; tab < 5; tab += 1) {
    await ctx.send(ctx.open(ctx.url));
  }

  const reply = await ctx.send(ctx.open(ctx.url));

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_limit' });
});
