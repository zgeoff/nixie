import { expect, onTestFinished, test } from 'bun:test';
import { startFrontProxy } from './start-front-proxy';

function setupTest() {
  const paths: string[] = [];

  const api = Bun.serve({
    fetch(request) {
      const url = new URL(request.url);

      paths.push(`api ${request.method} ${url.pathname}${url.search}`);

      return new Response('api');
    },
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await api.stop(true);
  });

  const web = Bun.serve({
    fetch(request) {
      const url = new URL(request.url);

      paths.push(`web ${request.method} ${url.pathname}${url.search}`);

      return new Response('web');
    },
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await web.stop(true);
  });

  return {
    apiURL: `http://127.0.0.1:${api.port}`,
    paths,
    webURL: `http://127.0.0.1:${web.port}`,
  };
}

test('it sends each /rpc request to the API', async () => {
  const ctx = setupTest();
  const proxy = startFrontProxy({ apiURL: ctx.apiURL, webURL: ctx.webURL });

  const response = await fetch(`${proxy.url}/rpc/sessions/list`, { body: '{}', method: 'POST' });
  const answer = await response.text();

  expect(answer).toBe('api');
  expect(ctx.paths).toStrictEqual(['api POST /rpc/sessions/list']);
});

test('it answers 502 when the server behind it is down', async () => {
  const ctx = setupTest();

  // a port that nothing listens on: the probe stops on the next line
  const probe = Bun.serve({ fetch: () => new Response(null), hostname: '127.0.0.1', port: 0 });

  await probe.stop(true);

  const proxy = startFrontProxy({ apiURL: `http://127.0.0.1:${probe.port}`, webURL: ctx.webURL });

  const response = await fetch(`${proxy.url}/rpc/sessions/list`, { body: '{}', method: 'POST' });

  expect(response.status).toBe(502);
});

test('it sends every other request to the web server with its query', async () => {
  const ctx = setupTest();
  const proxy = startFrontProxy({ apiURL: ctx.apiURL, webURL: ctx.webURL });

  const response = await fetch(`${proxy.url}/?from=icon`);
  const answer = await response.text();

  expect(answer).toBe('web');
  expect(ctx.paths).toStrictEqual(['web GET /?from=icon']);
});

test('it stops the proxy when the test finishes', () => {
  const ctx = setupTest();
  const proxy = startFrontProxy({ apiURL: ctx.apiURL, webURL: ctx.webURL });

  onTestFinished(async () => {
    const reached = await fetch(proxy.url).then(
      () => true,
      () => false,
    );

    expect(reached).toBeFalse();
  });
});
