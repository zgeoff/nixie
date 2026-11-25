import { expect, onTestFinished, test } from 'bun:test';
import { makeKeyedFetch } from './make-keyed-fetch';

function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const serve = (answer: (request: Request) => Response) => {
    const server = Bun.serve({ hostname: '127.0.0.1', port: 0, fetch: answer });

    stack.defer(() => server.stop(true));

    return server;
  };

  return { serve };
}

test('it adds the header to a request and keeps the headers the caller set', async () => {
  const ctx = setupTest();
  const server = ctx.serve((request) => Response.json(Object.fromEntries(request.headers)));
  const keyed = makeKeyedFetch('x-api-key', 'fake-value');

  const response = await keyed(`http://127.0.0.1:${server.port}`, {
    headers: { 'content-type': 'application/json' },
  });

  const headers = await response.json();

  expect(headers).toMatchObject({
    'x-api-key': 'fake-value',
    'content-type': 'application/json',
  });
});
