import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComputerRequest } from '@heynixie/wire';
import { chromium } from 'playwright-core';
import { makeStubDriver } from '../screen/make-stub-driver';
import { makeBrowserHandler } from './make-browser-handler';
import type { BrowserState } from './types';

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
  const home = await mkdtemp(join(tmpdir(), 'browser-'));

  const scanned: string[] = [];
  const resolved: string[] = [];
  const refusal: { reason: string | null } = { reason: null };
  const loads = { count: 0 };
  const driven: { state: BrowserState | null } = { state: null };

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
      '/opener': new Response(
        `<html><title>Opener</title><body><button onclick="window.open('http://other.test:' + location.port + '/terms')">New tab</button></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
      '/terms': new Response('<html><title>Terms</title><body>the terms</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      '/count': () => {
        loads.count += 1;

        return new Response(
          `<html><title>Load ${String(loads.count)}</title><body>loaded</body></html>`,
          {
            headers: { 'Content-Type': 'text/html' },
          },
        );
      },
      '/late': new Response(
        `<html><title>Late</title><body><div id="out">searching</div><script>
        setTimeout(() => fetch('/late-data').then((r) => r.text()).then((t) => { document.getElementById('out').textContent = t; }), 100);
        </script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
      '/late-data': new Response('late result for the search'),
      '/challenge': new Response(
        '<html><title>Just a moment</title><body>checking your browser</body></html>',
        { status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' } },
      ),
      '/denied-marked': new Response(
        `<html><title>Denied</title><body>${'x'.repeat(200)}<script src="/cdn-cgi/challenge-platform/h/b"></script></body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      ),
      '/denied-unserializable': new Response(
        `<html><title>Denied</title><body><script src="/cdn-cgi/challenge-platform/h/b"></script><script>
        for (const name of ['outerHTML', 'innerHTML']) {
          Object.defineProperty(Element.prototype, name, {
            get() { throw new Error('serialized the whole document'); },
          });
        }
        </script>${'x'.repeat(5000)}</body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      ),
      '/challenge-moves-on': new Response(
        `<html><title>Just a moment</title><body>checking your browser<script>
        setTimeout(() => { location.href = '/terms'; }, 200);
        </script></body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html', 'cf-mitigated': 'challenge' } },
      ),
      '/marked-moves-on': new Response(
        `<html><title>Denied</title><body>${'x'.repeat(200)}<script src="/cdn-cgi/challenge-platform/h/b"></script><script>
        const createTreeWalker = Document.prototype.createTreeWalker;
        Document.prototype.createTreeWalker = function (...args) {
          history.replaceState(null, '', '/terms');
          return createTreeWalker.apply(this, args);
        };
        </script></body></html>`,
        { status: 403, headers: { 'Content-Type': 'text/html' } },
      ),
      '/breaks-reads': new Response(
        `<html><title>Breaks</title><body>page<script>
        const stringify = JSON.stringify;
        let calls = 0;
        JSON.stringify = (...args) => {
          calls += 1;
          if (calls > 1) throw new Error('the page broke');
          return stringify(...args);
        };
        </script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } },
      ),
      '/to-v6only': () =>
        new Response(null, { status: 302, headers: { Location: 'https://v6only.test/' } }),
      '/done': new Response('<html><title>Done</title><body>welcome aboard</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
      '/report.txt': new Response('report body', {
        headers: { 'Content-Disposition': 'attachment; filename="report.txt"' },
      }),
    },
  });

  const answers: Record<string, string[]> = { 'v6only.test': ['2606:4700::1111'] };

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
    resolveHost: (host) => {
      resolved.push(host);

      return Promise.resolve(answers[host] ?? ['127.0.0.1']);
    },
    screen: {
      makeDriver: (state) => {
        driven.state = state;

        return makeStubDriver(state.tabs);
      },
      settleMs: 50,
    },
  });

  onTestFinished(async () => {
    await handle.stop();
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
    open: (url: string, bodyBytes = 1_000_000): ComputerRequest => ({
      op: 'open',
      url,
      limits: {
        bodyBytes,
        timeoutMs: 20_000,
        redirects: 5,
        textBytes: 20_000,
        imageBytes: 0,
      },
      deniedRanges: [],
    }),
    url: `http://pages.test:${String(site.port)}/`,
    loads,
    limits: {
      bodyBytes: 1_000_000,
      timeoutMs: 20_000,
      redirects: 5,
      textBytes: 20_000,
      imageBytes: 0,
    },

    closeTabBehindTheTools: async (tab: string): Promise<void> => {
      await send({ op: 'takeoverBegin' });

      await driven.state?.tabs.get(tab)?.page.close();
    },

    scanned,
    resolved,
    send,
    waitUntilTitle: async (title: string, tab = 't1'): Promise<void> => {
      let current = '';

      while (current !== title) {
        await Bun.sleep(20);

        const read = await send({ op: 'read', tab, mode: 'text' });

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

test.skipIf(!hasChromium)('it resolves no host for an address whose scan is refused', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open('http://secret-in-host.test/'), 'holds a secret');

  expect(ctx.resolved).toStrictEqual([]);
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

test.skipIf(!hasChromium)(
  'it reports the tab a person opened in a hold as the window in focus, with its site listed',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(`${ctx.url}opener`));
    await ctx.send({ op: 'takeoverBegin' });
    await ctx.send({ op: 'read', tab: 't1', mode: 'snapshot' });

    await ctx.send({
      op: 'act',
      tab: 't1',
      expectURL: `${ctx.url}opener`,
      acts: [{ kind: 'click', element: 'E1' }],
      submit: false,
    });

    await ctx.waitUntilTitle('Terms', 't2');

    const ended = await ctx.send({ op: 'takeoverEnd' });

    expect(ended).toMatchObject({
      kind: 'takeover-ended',
      origins: ['http://pages.test', 'http://other.test'],
      now: { kind: 'browser', tab: 't2', text: expect.stringContaining('the terms') },
    });
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

test.skipIf(!hasChromium)('it navigates a tab to a new address and keeps its ID', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({
    op: 'navigate',
    tab: 't1',
    url: `${ctx.url}terms`,
    limits: ctx.limits,
    deniedRanges: [],
  });

  expect(reply).toMatchObject({
    kind: 'page',
    tab: 't1',
    page: { url: `${ctx.url}terms`, status: 200, title: 'Terms' },
  });
});

test.skipIf(!hasChromium)('it scans the address a navigation goes to', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  await ctx.send({
    op: 'navigate',
    tab: 't1',
    url: `${ctx.url}terms`,
    limits: ctx.limits,
    deniedRanges: [],
  });

  expect(ctx.scanned).toContain(`${ctx.url}terms`);
});

test.skipIf(!hasChromium)('it keeps the tab open when a navigation fails', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const failed = await ctx.send(
    { op: 'navigate', tab: 't1', url: `${ctx.url}terms`, limits: ctx.limits, deniedRanges: [] },
    'no secrets',
  );

  const again = await ctx.send({
    op: 'navigate',
    tab: 't1',
    url: `${ctx.url}terms`,
    limits: ctx.limits,
    deniedRanges: [],
  });

  expect([failed, again]).toMatchObject([
    { kind: 'failed', reason: 'failed' },
    { kind: 'page', tab: 't1', page: { title: 'Terms' } },
  ]);
});

test.skipIf(!hasChromium)('it answers tab_gone for a navigation of an unknown tab', async () => {
  const ctx = await setupTest();

  const reply = await ctx.send({
    op: 'navigate',
    tab: 't9',
    url: ctx.url,
    limits: ctx.limits,
    deniedRanges: [],
  });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_gone' });
});

test.skipIf(!hasChromium)('it reloads a tab and reads the page again', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(`${ctx.url}count`));

  const reply = await ctx.send({ op: 'reload', tab: 't1', limits: ctx.limits });

  expect(reply).toMatchObject({ kind: 'page', tab: 't1', page: { title: 'Load 2' } });
});

test.skipIf(!hasChromium)('it answers tab_gone for a reload of an unknown tab', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send({ op: 'reload', tab: 't9', limits: ctx.limits });

  expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_gone' });
});

test.skipIf(!hasChromium)(
  'it names the blocked reason when an open lands on a challenge page',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}challenge`));

    expect(reply).toMatchObject({
      kind: 'page',
      page: { status: 403 },
      blocked: "blocked by the site's bot protection (Cloudflare challenge)",
    });
  },
);

test.skipIf(!hasChromium)(
  'it names the blocked reason when a navigation lands on one',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(ctx.url));

    const reply = await ctx.send({
      op: 'navigate',
      tab: 't1',
      url: `${ctx.url}challenge`,
      limits: ctx.limits,
      deniedRanges: [],
    });

    expect(reply).toMatchObject({
      kind: 'page',
      blocked: "blocked by the site's bot protection (Cloudflare challenge)",
    });
  },
);

test.skipIf(!hasChromium)('it names no blocked reason for an ordinary page', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send(ctx.open(ctx.url));

  expect(reply).toMatchObject({ kind: 'page', blocked: null });
});

test.skipIf(!hasChromium)(
  'it answers tab_gone for a tab whose page closed behind the tools',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(`${ctx.url}challenge`));
    await ctx.closeTabBehindTheTools('t1');

    const reply = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

    expect(reply).toStrictEqual({ kind: 'failed', ok: false, reason: 'tab_gone' });
  },
);

test.skipIf(!hasChromium)(
  'it fails a call whose page breaks under it and keeps answering',
  async () => {
    const ctx = await setupTest();

    await ctx.send(ctx.open(`${ctx.url}breaks-reads`));

    const broken = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });
    const next = await ctx.send({ op: 'read', tab: 't9', mode: 'text' });

    expect([broken, next]).toMatchObject([
      { kind: 'failed', reason: 'failed', message: expect.stringContaining('the page broke') },
      { kind: 'failed', reason: 'tab_gone' },
    ]);
  },
);

test.skipIf(!hasChromium)(
  'it says nixie reaches IPv4 hosts only for an open of an IPv6-only host',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open('http://v6only.test/'));

    expect(reply).toStrictEqual({
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: 'v6only.test has no IPv4 address, and nixie reaches IPv4 hosts only',
    });
  },
);

test.skipIf(!hasChromium)('it says the same for a navigation, and keeps the tab', async () => {
  const ctx = await setupTest();

  await ctx.send(ctx.open(ctx.url));

  const reply = await ctx.send({
    op: 'navigate',
    tab: 't1',
    url: 'http://v6only.test/',
    limits: ctx.limits,
    deniedRanges: [],
  });

  const read = await ctx.send({ op: 'read', tab: 't1', mode: 'text' });

  expect([reply, read]).toMatchObject([
    {
      kind: 'failed',
      message: 'v6only.test has no IPv4 address, and nixie reaches IPv4 hosts only',
    },
    { kind: 'page', page: { title: 'Sign up' } },
  ]);
});

test.skipIf(!hasChromium)(
  'it says nixie reaches IPv4 hosts only when a redirect leads to an IPv6-only host',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}to-v6only`));

    expect(reply).toStrictEqual({
      kind: 'failed',
      ok: false,
      reason: 'failed',
      message: 'v6only.test has no IPv4 address, and nixie reaches IPv4 hosts only',
    });
  },
);

test.skipIf(!hasChromium)(
  'it reports the status and blocked reason of the page a challenge sends the tab on to',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}challenge-moves-on`));

    expect(reply).toMatchObject({
      kind: 'page',
      blocked: null,
      page: { url: `${ctx.url}terms`, status: 200, title: 'Terms' },
    });
  },
);

test.skipIf(!hasChromium)(
  'it drops the challenge status and reason when the tab moves after the scan',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}marked-moves-on`));

    expect(reply).toMatchObject({
      kind: 'page',
      blocked: null,
      page: { url: `${ctx.url}terms`, status: 0, title: 'Denied' },
    });
  },
);

test.skipIf(!hasChromium)(
  'it finds a challenge in the body of a refusal within the limit',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}denied-marked`));

    expect(reply).toMatchObject({
      kind: 'page',
      blocked: "blocked by the site's bot protection (Cloudflare challenge)",
    });
  },
);

test.skipIf(!hasChromium)(
  'it finds a challenge in a refusal without serializing the whole document',
  async () => {
    const ctx = await setupTest();
    const reply = await ctx.send(ctx.open(`${ctx.url}denied-unserializable`, 200));

    expect(reply).toMatchObject({
      kind: 'page',
      blocked: "blocked by the site's bot protection (Cloudflare challenge)",
    });
  },
);

test.skipIf(!hasChromium)('it reads no body past the limit to look for a challenge', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send(ctx.open(`${ctx.url}denied-marked`, 100));

  expect(reply).toMatchObject({ kind: 'page', blocked: null });
});

test.skipIf(!hasChromium)('it reads what a page fetches right after it loads', async () => {
  const ctx = await setupTest();
  const reply = await ctx.send(ctx.open(`${ctx.url}late`));

  expect(reply).toMatchObject({
    kind: 'page',
    page: { text: expect.stringContaining('late result for the search') },
  });
});
