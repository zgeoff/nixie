import { expect, onTestFinished, test } from 'bun:test';
import { makeAddressCheck } from './make-address-check';
import { startCheckingProxy } from './start-checking-proxy';
import { askProxy } from './test-utils/ask-proxy';

async function setupTest(overrides: { scanURL?: (url: string) => Promise<void> } = {}) {
  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: { '/*': (request) => new Response(`hello ${new URL(request.url).pathname}`) },
  });

  onTestFinished(async () => {
    await site.stop(true);
  });

  const scanned: string[] = [];

  const proxy = await startCheckingProxy({
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

  return { site, proxy, scanned };
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

test('it refuses a host with one non-public address among public ones', async () => {
  const proxy = await startCheckingProxy({
    checkAddress: makeAddressCheck([]),
    resolveHost: () => Promise.resolve(['93.184.216.34', '10.0.0.1']),
    scanURL: () => Promise.resolve(),
  });

  onTestFinished(async () => {
    await proxy.stop();
  });

  const reply = await askProxy(proxy.port, 'CONNECT pages.test:443 HTTP/1.1\r\n\r\n');

  expect(reply).toContain('403 Forbidden');
});
