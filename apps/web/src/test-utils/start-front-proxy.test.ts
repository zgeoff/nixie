import { expect, mock, onTestFinished, test } from 'bun:test';
import { startFrontProxy } from './start-front-proxy';

function setupTest() {
  const paths: string[] = [];

  const answerAPIRequest = (request: Request) => {
    const url = new URL(request.url);

    paths.push(`api ${request.method} ${url.pathname}${url.search}`);

    return new Response('api');
  };

  const api = Bun.serve({
    fetch: answerAPIRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await api.stop(true);
  });

  const answerWebRequest = (request: Request) => {
    const url = new URL(request.url);

    paths.push(`web ${request.method} ${url.pathname}${url.search}`);

    return new Response('web');
  };

  const web = Bun.serve({
    fetch: answerWebRequest,
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
  const answerProbe = mock(() => new Response(null));
  const probe = Bun.serve({ fetch: answerProbe, hostname: '127.0.0.1', port: 0 });

  await probe.stop(true);

  const proxy = startFrontProxy({ apiURL: `http://127.0.0.1:${probe.port}`, webURL: ctx.webURL });

  const response = await fetch(`${proxy.url}/rpc/sessions/list`, { body: '{}', method: 'POST' });

  expect(response.status).toBe(502);
});

test('it ends a stream whose server stops partway, after the part it sent', async () => {
  const answerRequest = mock(
    () =>
      new Response(
        new ReadableStream({
          start: (controller) => {
            controller.enqueue(new TextEncoder().encode('event 1\n'));
          },
        }),
      ),
  );

  const streaming = Bun.serve({
    fetch: answerRequest,
    hostname: '127.0.0.1',
    port: 0,
  });

  onTestFinished(async () => {
    await streaming.stop(true);
  });

  const proxy = startFrontProxy({
    apiURL: `http://127.0.0.1:${streaming.port}`,
    webURL: 'http://127.0.0.1:9',
  });

  const response = await fetch(`${proxy.url}/rpc/records/follow`, { body: '{}', method: 'POST' });

  const reader = response.body?.getReader();

  const first = await reader?.read();

  await streaming.stop(true);

  const after = await reader?.read();

  expect(new TextDecoder().decode(first?.value)).toBe('event 1\n');
  expect(after?.done).toBeTrue();
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
