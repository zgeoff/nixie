import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerRequest } from '@heynixie/wire';
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
  const home = await mkdtemp(join(tmpdir(), 'browser-'));

  const scanned: string[] = [];
  const refusal: { reason: string | null } = { reason: null };

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/': new Response(
        `<html><title>Sign up</title><body><h1>Welcome</h1><a href="/terms">Terms</a>
        <form action="/done" method="post"><input name="n" placeholder="Name" />
        <button type="submit">Create account</button></form>
        <form action="http://other.test/post" method="post"><button type="submit">Elsewhere</button></form>
        <a href="/report.txt" download>Download</a>
        <div style="height:3000px">tall</div><button id="low">Bottom button</button></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
      '/tamper': new Response(
        `<html><title>Tamper</title><body><script>
        Object.defineProperty(window, 'outerHeight', { value: 5000 });
        Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
        </script>page</body></html>`,
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
    isHeadless: true,
    gate: {
      scan: (url) => {
        scanned.push(url);

        return refusal.reason === null
          ? Promise.resolve()
          : Promise.reject(new Error(refusal.reason));
      },
      scanText: () => Promise.resolve(),
    },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    screen: { makeDriver: (state) => makeStubDriver(state.tabs), settleMs: 50 },
  });

  onTestFinished(async () => {
    await site.stop(true);

    await rm(home, { recursive: true, force: true });
  });

  const send = (request: ComputerRequest, refuse?: string) => {
    refusal.reason = refuse ?? null;

    return handle(
      request,
      () => Promise.resolve(),
      () => Promise.resolve(),
    );
  };

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
    send,
    waitUntilTitle: async (title: string): Promise<void> => {
      let current = '';

      while (current !== title) {
        await Bun.sleep(20);

        const read = await send({ op: 'read', tab: 't1', mode: 'text' });

        current = read.kind === 'page' ? read.page.title : '';
      }
    },
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

test.skipIf(!hasChromium)(
  'it scrolls down to the end of the page and then up to the top',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const first = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });
    const second = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });
    const third = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });
    const fourth = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });
    const up = await ctx.send({ op: 'scroll', tab: 't1', to: 'up' });

    expect(
      [first, second, third, fourth].map((reply) => reply.kind === 'scroll' && reply.isAtEnd),
    ).toStrictEqual([false, false, false, true]);

    expect(up).toMatchObject({ kind: 'scroll', isAtEnd: false });
  },
);

test.skipIf(!hasChromium)(
  'it reports the top as the end when scrolling up from the top',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const reply = await ctx.send({ op: 'scroll', tab: 't1', to: 'up' });

    expect(reply).toMatchObject({
      kind: 'scroll',
      tab: 't1',
      isAtEnd: true,
      width: 1280,
      height: 800,
    });
  },
);

test.skipIf(!hasChromium)('it scrolls a control into view', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));
  await ctx.send({ op: 'read', tab: 't1', mode: 'snapshot' });

  const reply = await ctx.send({ op: 'scroll', tab: 't1', to: 'E5' });

  expect(reply).toMatchObject({ kind: 'scroll', isAtEnd: true });
});

test.skipIf(!hasChromium)('it refuses a scroll to a control that is not on the page', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({ op: 'scroll', tab: 't1', to: 'E99' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'stale_element' });
});

test.skipIf(!hasChromium)('it answers tab_gone for a scroll of a closed tab', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'scroll', tab: 't1', to: 'down' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_gone' });
});

test.skipIf(!hasChromium)(
  'it takes the picture of one control as the size of its box',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));
    await ctx.send({ op: 'read', tab: 't1', mode: 'snapshot' });

    const control = await ctx.send({ op: 'screenshot', tab: 't1', control: 'E1' });
    const viewport = await ctx.send({ op: 'screenshot', tab: 't1' });

    expect(control).toMatchObject({
      kind: 'screenshot',
      width: expect.toBeWithin(10, 1280),
      height: expect.toBeWithin(5, 100),
    });

    expect(viewport).toMatchObject({ kind: 'screenshot', width: 1280, height: 800 });
  },
);

test.skipIf(!hasChromium)(
  'it takes the picture of a control below the viewport without scrolling the page',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));
    await ctx.send({ op: 'read', tab: 't1', mode: 'snapshot' });

    const before = await ctx.send({ op: 'screenshot', tab: 't1' });
    const control = await ctx.send({ op: 'screenshot', tab: 't1', control: 'E5' });
    const after = await ctx.send({ op: 'screenshot', tab: 't1' });

    expect([control, after]).toStrictEqual([
      { kind: 'failed', ok: false, reason: 'stale_element' },
      before,
    ]);
  },
);

test.skipIf(!hasChromium)('it refuses the picture of a control that moved', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({ op: 'screenshot', tab: 't1', control: 'E99' });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'stale_element' });
});

test.skipIf(!hasChromium)(
  'it takes a picture of the desktop that names the tab in focus',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const shot = await ctx.send({ op: 'desktopShot' });

    expect(shot).toMatchObject({
      kind: 'desktop',
      width: 1280,
      height: 800,
      focus: { kind: 'browser', tab: 't1', url: ctx.url },
    });
  },
);

test.skipIf(!hasChromium)('it clicks a point on the page and follows the link there', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const bound = await ctx.send({
    op: 'screenBind',
    act: { kind: 'click', x: 20, y: 75, button: 'left' },
  });

  expect(bound).toMatchObject({
    kind: 'screen-target',
    target: { kind: 'browser', tab: 't1', url: ctx.url },
  });

  const reply = await ctx.send({
    op: 'screenAct',
    binding: { windowID: 'stub-browser', kind: 'browser', tab: 't1', url: ctx.url },
    act: { kind: 'click', x: 20, y: 75, button: 'left' },
  });

  expect(reply).toMatchObject({ kind: 'screen' });

  await ctx.waitUntilTitle('Terms');

  const page = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

  expect(page).toMatchObject({ kind: 'page', page: { title: 'Terms' } });
});

test.skipIf(!hasChromium)(
  'it types into the focused field and submits it with a chord',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const binding = { windowID: 'stub-browser', kind: 'browser' as const, tab: 't1', url: ctx.url };

    await ctx.send({ op: 'screenAct', binding, act: { kind: 'keys', keys: 'tab' } });
    await ctx.send({ op: 'screenAct', binding, act: { kind: 'keys', keys: 'tab' } });
    await ctx.send({ op: 'screenAct', binding, act: { kind: 'text', text: 'Ada' } });
    await ctx.send({ op: 'screenAct', binding, act: { kind: 'keys', keys: 'enter' } });
    await ctx.waitUntilTitle('Done');

    const page = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

    expect(page).toMatchObject({ kind: 'page', page: { title: 'Done' } });
  },
);

test.skipIf(!hasChromium)(
  'it reads the window from outside the page, so a page cannot hide its address bar',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(`${ctx.url}tamper`));

    const bound = await ctx.send({
      op: 'screenBind',
      act: { kind: 'click', x: 20, y: 75, button: 'left' },
    });

    expect(bound).toMatchObject({
      kind: 'screen-target',
      target: { kind: 'browser', tab: 't1', url: `${ctx.url}tamper` },
    });
  },
);

test.skipIf(!hasChromium)(
  'it refuses a screen act on a page that moved since it was bound',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const reply = await ctx.send({
      op: 'screenAct',
      binding: { windowID: 'stub-browser', kind: 'browser', tab: 't1', url: `${ctx.url}elsewhere` },
      act: { kind: 'click', x: 20, y: 75, button: 'left' },
    });

    expect(reply).toMatchObject({ kind: 'failed', reason: 'screen_changed' });
  },
);
