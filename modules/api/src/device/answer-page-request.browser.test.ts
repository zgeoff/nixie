import { expect, onTestFinished, test } from 'bun:test';
import { makeDeviceToolCaller, seedScreenOnDevice } from '@heynixie/devices/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { startPageFrameFront } from '../test-utils/start-page-frame-front';
import { startTestAPI } from '../test-utils/start-test-api';

interface PagePosts {
  readonly name?: string;
  readonly data?: unknown;
  readonly type?: string;
  readonly message?: string;
}

// The page runs in a real Chrome, in the frame that the API serves, under the policy it sends.
async function setupTest() {
  const api = await startTestAPI();

  const holder = { frame: '' };
  const front = startPageFrameFront({ apiURL: api.url, readFrame: () => holder.frame });
  const clock = api.context.clock;
  const streams = api.context.clients.devices;

  const device = await seedScreenOnDevice({ log: api.context.log, clock });

  streams.open(device.deviceID, { width: 1280, height: 720, pixelRatio: 1 });

  const call = makeDeviceToolCaller({
    log: api.context.log,
    definitions: api.context.definitions,
    clock,
    streams,
  });

  await call('device.layout', {
    device: device.deviceID,
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'pond', column: 1, row: 1 }],
  });

  const view = new Bun.WebView({ backend: 'chrome' });

  onTestFinished(() => {
    view.close();
  });

  const readPosts = async (): Promise<readonly PagePosts[]> => {
    const read = await view.evaluate('JSON.stringify(window.events)');

    return JSON.parse(String(read));
  };

  return {
    front,
    readPosts,

    // fills the region with a page and opens the host page that frames it
    openPage: async (html: string) => {
      await call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html },
      });

      const listed = await call('devices.list', {});

      const found = /"shown":"(?<shown>[^"]+)"/u.exec(JSON.stringify(listed));

      holder.frame = streams.tickets.issue(
        device.deviceID,
        'pond',
        found?.groups?.['shown'] ?? '',
        [],
      ).frame;

      await view.navigate('about:blank');
      await view.navigate(front.hostURL);
    },
    waitForPost: (name: string) =>
      waitForCondition(
        async () => {
          const posts = await readPosts();

          return posts.some((post) => post.name === name);
        },
        { intervalMs: 50, timeoutMs: 6000 },
      ),
    post: (data: unknown) => view.evaluate(`window.post(${JSON.stringify(data)})`),
    spoof: () => view.evaluate('window.spoof()'),
    waitForFrameLoads: (count: number) =>
      waitForCondition(
        async () => {
          const loads = await view.evaluate('window.loads');

          return Number(loads) >= count;
        },
        { intervalMs: 50, timeoutMs: 6000 },
      ),
  };
}

test('it keeps a page from reaching the network or the device page around it', async () => {
  const ctx = await setupTest();

  await ctx.openPage(`<script>
    const evil = ${JSON.stringify(ctx.front.evilOrigin)};
    const results = {};

    async function attempt(name, run) {
      try {
        await run();
        results[name] = 'allowed';
      } catch (error) {
        results[name] = error.name;
      }
    }

    (async () => {
      await attempt('fetch', () => fetch(evil + '/fetch'));
      navigator.sendBeacon(evil + '/beacon', 'x');
      await attempt('websocket', () => new Promise((resolve, reject) => {
        const socket = new WebSocket(evil.replace('http', 'ws') + '/ws');
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('refused'));
      }));
      await attempt('parentDocument', () => parent.document.title);
      await attempt('parentStorage', () => parent.localStorage.length);
      await attempt('ownCookie', () => document.cookie);
      await attempt('ownStorage', () => localStorage.length);
      await attempt('topNavigation', () => {
        top.location.href = evil + '/top';
      });
      await attempt('deviceAPI', () => fetch('/rpc/devices/resize', { method: 'POST' }));

      nixie.send('probed', results);

      new Image().src = evil + '/image';

      const form = document.createElement('form');
      form.action = evil + '/form';
      form.method = 'post';
      document.body.append(form);
      form.submit();

      location.href = evil + '/navigate';
    })();
  </script>`);

  await ctx.waitForPost('probed');
  await ctx.waitForFrameLoads(2);

  const posts = await ctx.readPosts();

  await fetch(`${ctx.front.evilOrigin}/control`);

  expect([
    posts.find((post) => post.name === 'probed')?.data,
    ctx.front.evilRequests,
  ]).toStrictEqual([
    {
      fetch: 'TypeError',
      websocket: 'Error',
      parentDocument: 'SecurityError',
      parentStorage: 'SecurityError',
      ownCookie: 'SecurityError',
      ownStorage: 'SecurityError',
      topNavigation: 'SecurityError',
      deviceAPI: 'TypeError',
    },
    ['/control'],
  ]);
});

test('it hands a page the message that came before the page asked for messages', async () => {
  const ctx = await setupTest();

  await ctx.openPage(`<script>
    setTimeout(() => {
      nixie.onMessage((data) => nixie.send('echo', data));
    }, 400);
    nixie.send('loaded');
  </script>`);

  await ctx.waitForPost('loaded');
  await ctx.post({ nixie: true, type: 'message', data: { ripples: 3 } });
  await ctx.waitForPost('echo');

  const posts = await ctx.readPosts();

  expect(posts.find((post) => post.name === 'echo')?.data).toStrictEqual({ ripples: 3 });
});

test('it takes a message from the device page alone', async () => {
  const ctx = await setupTest();

  await ctx.openPage(`<script>
    nixie.onMessage((data) => nixie.send('echo', data));
    nixie.send('loaded');
  </script>`);

  await ctx.waitForPost('loaded');
  await ctx.spoof();
  await ctx.post({ nixie: true, type: 'message', data: 'real' });
  await ctx.post({ nixie: true, type: 'message', data: 'marker' });

  await waitForCondition(
    async () => {
      const posts = await ctx.readPosts();

      return posts.some((post) => post.data === 'marker');
    },
    { intervalMs: 50, timeoutMs: 6000 },
  );

  const posts = await ctx.readPosts();

  expect(posts.filter((post) => post.name === 'echo').map((post) => post.data)).toStrictEqual([
    'real',
    'marker',
  ]);
});

test('it reports an error that the page raises', async () => {
  const ctx = await setupTest();

  await ctx.openPage(
    `<script>nixie.send('loaded'); throw new TypeError('x is undefined');</script>`,
  );

  await ctx.waitForPost('loaded');

  await waitForCondition(
    async () => {
      const posts = await ctx.readPosts();

      return posts.some((post) => post.type === 'error');
    },
    { intervalMs: 50, timeoutMs: 6000 },
  );

  const posts = await ctx.readPosts();

  expect(posts.find((post) => post.type === 'error')?.message).toContain('x is undefined');
});
