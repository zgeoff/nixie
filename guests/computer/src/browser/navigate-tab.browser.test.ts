import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computerReplySchema } from '@heynixie/wire';
import { makeStubDriver } from '../screen/make-stub-driver';
import { makeBrowserHandler } from './make-browser-handler';

async function setupTest() {
  const limits = {
    bodyBytes: 1_000_000,
    timeoutMs: 20_000,
    redirects: 5,
    textBytes: 20_000,
    imageBytes: 0,
  };

  const home = await mkdtemp(join(tmpdir(), 'navigate-'));

  const loads = { count: 0 };

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/first': () => {
        loads.count += 1;

        return new Response(
          `<html><title>First ${String(loads.count)}</title><body>the first page</body></html>`,
          { headers: { 'Content-Type': 'text/html' } },
        );
      },
      '/second': new Response('<html><title>Second</title><body>the second page</body></html>', {
        headers: { 'Content-Type': 'text/html' },
      }),
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

  const send = async (request: Parameters<typeof handle>[0]) => {
    const reply = await handle(
      request,
      () => Promise.resolve(),
      () => Promise.resolve(),
    );

    return computerReplySchema.parse(reply);
  };

  const base = `http://pages.test:${String(site.port)}`;

  return {
    open: () => send({ op: 'open', url: `${base}/first`, limits, deniedRanges: [] }),
    navigate: (tab: string, path: string) =>
      send({ op: 'navigate', tab, url: `${base}${path}`, limits, deniedRanges: [] }),
    reload: (tab: string) => send({ op: 'reload', tab, limits }),
    read: (tab: string) => send({ op: 'read', tab, mode: 'text' }),
  };
}

test('it navigates a tab to a new address, then reloads it', async () => {
  const ctx = await setupTest();

  await ctx.open();

  const navigated = await ctx.navigate('t1', '/second');
  const reloaded = await ctx.reload('t1');
  const read = await ctx.read('t1');

  expect([navigated, reloaded, read]).toMatchObject([
    { kind: 'page', tab: 't1', page: { title: 'Second' } },
    { kind: 'page', tab: 't1', page: { title: 'Second' } },
    { kind: 'page', tab: 't1', page: { title: 'Second' } },
  ]);
});

test('it fetches the page again when it reloads a tab', async () => {
  const ctx = await setupTest();

  await ctx.open();

  const reloaded = await ctx.reload('t1');

  expect(reloaded).toMatchObject({ kind: 'page', page: { title: 'First 2' } });
});
