import { expect, onTestFinished, test } from 'bun:test';
import type { IncomingMessage } from 'node:http';
import { Agent, request } from 'node:https';
import { connect } from 'node:tls';
import { startTestSite } from './start-test-site';

test('it answers HTTPS for its names and records each request', async () => {
  const site = await startTestSite({
    names: ['site.test'],
    fetch: () => new Response('hello'),
  });

  const response = Promise.withResolvers<IncomingMessage>();

  request(
    {
      host: '127.0.0.1',
      port: site.port,
      path: '/page',
      servername: 'site.test',
      headers: { host: 'site.test' },
      ca: site.ca,
      agent: new Agent({ proxyEnv: {} }),
    },
    response.resolve,
  )
    .on('error', response.reject)
    .end();

  const answer = await response.promise;
  const chunks = await answer.toArray();

  expect(Buffer.concat(chunks).toString()).toBe('hello');
  expect(site.requests).toMatchObject([{ url: 'https://site.test/page' }]);
});

test('it stops the site when the test finishes', async () => {
  const site = await startTestSite({ names: ['site.test'], fetch: () => new Response('hello') });

  onTestFinished(() => {
    const socket = connect({ host: '127.0.0.1', port: site.port, ca: site.ca });
    const failed = Promise.withResolvers<boolean>();

    socket.on('error', () => {
      failed.resolve(true);
    });

    socket.on('secureConnect', () => {
      socket.destroy();
      failed.resolve(false);
    });

    expect(failed.promise).resolves.toBeTrue();
  });
});
