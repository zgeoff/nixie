import { expect, test } from 'bun:test';
import { startTestSite } from '@heynixie/egress/test-utils';
import { makeGoogleTransport } from './make-google-transport';

test('it sends a request for a Google test host to the HTTPS site, with its path and query', async () => {
  const site = await startTestSite({ names: ['localhost'], respond: () => new Response('ok') });

  const transport = makeGoogleTransport({
    url: `https://localhost:${String(site.port)}`,
    ca: site.ca,
  });

  const response = await transport('https://oauth.google.test/token?a=1', { method: 'POST' });
  const text = await response.text();

  expect([text, site.requests.map((request) => request.url)]).toStrictEqual([
    'ok',
    [`https://localhost:${String(site.port)}/token?a=1`],
  ]);
});
