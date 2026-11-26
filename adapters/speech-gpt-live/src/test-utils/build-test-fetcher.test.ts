import { expect, test } from 'bun:test';
import { startTestSite } from '@heynixie/egress/test-utils';
import { buildTestFetcher } from './build-test-fetcher';

async function setupTest() {
  const site = await startTestSite({
    names: ['localhost'],
    respond: () => new Response('plain'),
    socket: {
      onMessage: (connection, text) => {
        connection.send(`echo ${text}`);
      },
    },
  });

  return { site, fetcher: buildTestFetcher(site.ca), origin: `localhost:${String(site.port)}` };
}

test('it sends a request to the site with no credential of its own', async () => {
  const ctx = await setupTest();
  const response = await ctx.fetcher(`https://${ctx.origin}/v1/live/sessions`);
  const body = await response.text();

  expect(body).toBe('plain');
  expect(ctx.site.requests[0]?.headers['authorization']).toBeUndefined();
});

test('it opens a socket that exchanges text and ends when the site closes it', async () => {
  const ctx = await setupTest();
  const socket = await ctx.fetcher.openSocket(`wss://${ctx.origin}/attach`);

  socket.send('hello');

  const texts: string[] = [];

  for await (const text of socket.messages) {
    texts.push(text);
    ctx.site.connections[0]?.close();
  }

  expect(texts).toStrictEqual(['echo hello']);
});

test('it rejects an open that its signal aborts', async () => {
  const ctx = await setupTest();

  const controller = new AbortController();

  const opening = ctx.fetcher.openSocket(`wss://${ctx.origin}/attach`, {
    signal: controller.signal,
  });

  controller.abort();

  expect(opening).rejects.toThrow('the open was aborted');
});
