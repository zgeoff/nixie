import { expect, onTestFinished, test } from 'bun:test';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { startRefusingProxy } from './start-refusing-proxy';

function setupTest() {
  const proxy = startRefusingProxy();

  onTestFinished(() => {
    proxy.stop();
  });

  return { proxy };
}

test.each([
  ['a tunnel', 'CONNECT api.example.test:443 HTTP/1.1\r\n\r\n', 'api.example.test:443'],
  [
    'a plain request',
    'GET http://site.example.test/a HTTP/1.1\r\n\r\n',
    'http://site.example.test/a',
  ],
])('it refuses %s at once and lists its target', async (_kind, request, target) => {
  const ctx = setupTest();
  const client = createConnection({ host: '127.0.0.1', port: Number(new URL(ctx.proxy.url).port) });

  onTestFinished(() => {
    client.destroy();
  });

  client.write(request);

  const answer: unknown[] = await once(client, 'data');

  expect(String(answer[0])).toStartWith('HTTP/1.1 403 Forbidden');
  expect(ctx.proxy.targets()).toStrictEqual([target]);
});
