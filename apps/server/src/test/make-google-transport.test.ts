import { expect, onTestFinished, test } from 'bun:test';
import { makeGoogleTransport } from './make-google-transport';

test('it sends a request for a Google test host to the site, with its path and query', async () => {
  const seen: string[] = [];

  const site = Bun.serve({
    port: 0,
    hostname: '127.0.0.1',
    routes: {
      '/token': (request) => {
        const url = new URL(request.url);

        seen.push(`${request.method} ${url.pathname}${url.search}`);

        return new Response('ok');
      },
    },
  });

  onTestFinished(() => site.stop(true));

  const transport = makeGoogleTransport(`http://127.0.0.1:${String(site.port)}`);

  const response = await transport('https://oauth.google.test/token?a=1', { method: 'POST' });
  const text = await response.text();

  expect([text, seen]).toStrictEqual(['ok', ['POST /token?a=1']]);
});
