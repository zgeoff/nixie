import { expect, onTestFinished, test } from 'bun:test';
import { makeAddressCheck } from './make-address-check';
import { startCheckingProxy } from './start-checking-proxy';
import { askProxy } from './test-utils/ask-proxy';

async function setupTest(
  overrides: { scanURL?: (url: string) => Promise<void>; canTunnel?: boolean } = {},
) {
  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/*': async (request) =>
        new Response(`hello ${new URL(request.url).pathname} ${await request.text()}`),
    },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const scanned: string[] = [];
  const scannedTexts: string[] = [];

  const proxy = await startCheckingProxy({
    canTunnel: overrides.canTunnel ?? true,
    scanText: (text) => {
      scannedTexts.push(text);

      return text.includes('synthetic-secret')
        ? Promise.reject(new Error('holds a secret'))
        : Promise.resolve();
    },
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    scanURL: (url) => {
      scanned.push(url);

      return overrides.scanURL?.(url) ?? Promise.resolve();
    },
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  return { site, proxy, scanned, scannedTexts };
}

test('it forwards a plain request to the address it checked and scans its whole URL', async () => {
  const ctx = await setupTest();

  const url = `http://pages.test:${String(ctx.site.port)}/docs?q=1`;

  const reply = await askProxy(
    ctx.proxy.port,
    `GET ${url} HTTP/1.1\r\nHost: pages.test\r\nProxy-Connection: keep-alive\r\n\r\n`,
  );

  expect(reply).toContain('hello /docs');
  expect(ctx.scanned).toStrictEqual([url]);
});

test('it tunnels a CONNECT and scans its host', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `CONNECT pages.test:${String(ctx.site.port)} HTTP/1.1\r\n\r\nGET /x HTTP/1.1\r\nHost: pages.test\r\nConnection: close\r\n\r\n`,
  );

  expect(reply).toContain('200 Connection Established');
  expect(reply).toContain('hello /x');
  expect(ctx.scanned).toStrictEqual([`https://pages.test:${String(ctx.site.port)}/`]);
});

test('it refuses a request whose URL the scan refuses and sends nothing upstream', async () => {
  const ctx = await setupTest({ scanURL: () => Promise.reject(new Error('holds a secret')) });

  const reply = await askProxy(
    ctx.proxy.port,
    `GET http://pages.test:${String(ctx.site.port)}/ HTTP/1.1\r\nHost: pages.test\r\n\r\n`,
  );

  expect(reply).toContain('403 Forbidden');
  expect(reply).toContain('holds a secret');
});

test('it refuses a host that resolves to a non-public address', async () => {
  const site = Bun.serve({ port: 0, hostname: '127.0.0.1', routes: { '/*': new Response('no') } });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['127.0.0.1']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(
    proxy.port,
    `GET http://pages.test:${String(site.port)}/ HTTP/1.1\r\nHost: pages.test\r\n\r\n`,
  );

  expect(reply).toContain('403 Forbidden');
});

test('it refuses a host that has only IPv6 addresses and says nixie reaches IPv4 hosts only', async () => {
  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['2606:4700::1111']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(proxy.port, 'CONNECT maps.test:443 HTTP/1.1\r\n\r\n');

  expect(reply).toContain('403 Forbidden');
  expect(reply).toContain('maps.test has no IPv4 address, and nixie reaches IPv4 hosts only');
});

test('it names the host of a refusal for having only IPv6 addresses to its caller', async () => {
  const hosts: string[] = [];

  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['2606:4700::1111']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
    onIPv4OnlyHost: (host) => {
      hosts.push(host);
    },
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  await askProxy(proxy.port, 'CONNECT maps.test:443 HTTP/1.1\r\n\r\n');

  expect(hosts).toStrictEqual(['maps.test']);
});

test('it names no host to its caller for a host with a non-public address', async () => {
  const hosts: string[] = [];

  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['::1']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
    onIPv4OnlyHost: (host) => {
      hosts.push(host);
    },
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  await askProxy(proxy.port, 'CONNECT maps.test:443 HTTP/1.1\r\n\r\n');

  expect(hosts).toStrictEqual([]);
});

test('it says a host with a non-public address is not public, whatever else it has', async () => {
  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['::1']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(proxy.port, 'CONNECT maps.test:443 HTTP/1.1\r\n\r\n');

  expect(reply).toContain('is not a public address');
});

test('it connects to the IPv4 address of a host that lists an IPv6 address first', async () => {
  const ctx = await setupTest();

  const proxy = await startCheckingProxy({
    checkAddress: () => true,
    resolveHost: () => Promise.resolve(['2606:4700::1111', '127.0.0.1']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(
    proxy.port,
    `GET http://pages.test:${String(ctx.site.port)}/x HTTP/1.1\r\nHost: pages.test\r\n\r\n`,
  );

  expect(reply).toContain('hello /x');
});

test('it refuses a host with one non-public address among public ones', async () => {
  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['93.184.216.34', '10.0.0.1']),
    scanURL: () => Promise.resolve(),
    scanText: () => Promise.resolve(),
    canTunnel: true,
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(proxy.port, 'CONNECT pages.test:443 HTTP/1.1\r\n\r\n');

  expect(reply).toContain('403 Forbidden');
});

test('it sends the body of a plain request upstream after the scan of its headers and body passes', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `POST http://pages.test:${String(ctx.site.port)}/up HTTP/1.1\r\nHost: pages.test\r\nContent-Length: 5\r\n\r\nhello`,
  );

  expect(reply).toContain('hello /up hello');
  expect(ctx.scannedTexts).toStrictEqual([expect.stringContaining('hello')]);
});

test('it refuses a request whose body holds a secret the URL does not', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `POST http://pages.test:${String(ctx.site.port)}/up HTTP/1.1\r\nHost: pages.test\r\nContent-Length: 16\r\n\r\nsynthetic-secret`,
  );

  expect(reply).toContain('403 Forbidden');
  expect(reply).not.toContain('hello /up');
});

test('it refuses a request whose header holds a secret', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `GET http://pages.test:${String(ctx.site.port)}/up HTTP/1.1\r\nHost: pages.test\r\nX-Note: synthetic-secret\r\n\r\n`,
  );

  expect(reply).toContain('403 Forbidden');
  expect(reply).not.toContain('hello /up');
});

test('it refuses a chunked body, which it cannot scan before it sends', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `POST http://pages.test:${String(ctx.site.port)}/up HTTP/1.1\r\nHost: pages.test\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`,
  );

  expect(reply).toContain('411 Length Required');
});

test('it refuses a body larger than it can scan', async () => {
  const ctx = await setupTest();

  const reply = await askProxy(
    ctx.proxy.port,
    `POST http://pages.test:${String(ctx.site.port)}/up HTTP/1.1\r\nHost: pages.test\r\nContent-Length: 2000000\r\n\r\n`,
  );

  expect(reply).toContain('413 Payload Too Large');
});

test('it refuses a CONNECT tunnel when the client may not tunnel', async () => {
  const ctx = await setupTest({ canTunnel: false });

  const reply = await askProxy(
    ctx.proxy.port,
    `CONNECT pages.test:${String(ctx.site.port)} HTTP/1.1\r\n\r\n`,
  );

  expect(reply).toContain('403 Forbidden');
  expect(ctx.scanned).toStrictEqual([]);
});
