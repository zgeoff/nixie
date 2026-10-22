import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel } from '@heynixie/testing';
import { createCounterStore } from './create-counter-store';
import { makeProxyHandler } from './make-proxy-handler';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'counting-proxy-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const storePath = join(directory, 'counter.json');
  const log = mock<Logger>(() => {});

  return { directory, model, storePath, log };
}

test('it prices a reply through its route profile, the 1-hour cache write price included', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies({
    text: 'priced',
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
  });

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(200);

  // 40 × $1 + 1,000 × $1.25 + 2,000 × $2 + 800 × $0.10 + 12 × $5, per million tokens
  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 0.00543, tokens: 3852, lost: false });
});

test('it prices a streamed reply from its message start and its last delta', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies({
    text: 'streamed',
    usage: {
      input_tokens: 40,
      output_tokens: 12,
      cache_creation_input_tokens: 3000,
      cache_read_input_tokens: 800,
      cache_creation: { ephemeral_5m_input_tokens: 1000, ephemeral_1h_input_tokens: 2000 },
    },
  });

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', stream: true, messages: [] }),
    }),
  );

  const text = await response.text();

  expect(text).toInclude('"text_delta","text":"streamed"');

  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 0.00543, tokens: 3852, lost: false });
});

test('it refuses every request once the replies it counted reach its dollar limit', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 1000, output_tokens: 1000 } },
    { text: 'second', usage: { input_tokens: 1000, output_tokens: 1000 } },
    { text: 'third', usage: { input_tokens: 1000, output_tokens: 1000 } },
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 0.01, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  await sendRequest();
  await sendRequest();

  const refused = await sendRequest();

  expect(refused.status).toBe(403);

  const body: unknown = await refused.json();

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'permission_error',
      message:
        'the counting proxy reached its spending limit ($0.0120 of $0.01), so it refuses every further request',
    },
  });

  expect(ctx.model.requests).toHaveLength(2);
});

test('it refuses every request once the replies it counted reach its token limit', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 600, output_tokens: 400 } },
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: null, tokens: 1000 },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  await sendRequest();

  const refused = await sendRequest();

  expect(refused.status).toBe(403);
  expect(ctx.model.requests).toHaveLength(1);
});

test('it logs the limit once when a count reaches it', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies({ text: 'only', usage: { input_tokens: 600, output_tokens: 400 } });

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: null, tokens: 1000 },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  await sendRequest();
  await sendRequest();

  expect(ctx.log).toHaveBeenCalledExactlyOnceWith(
    'limit.reached',
    { dollars: 0.0026, tokens: 1000 },
    'warn',
  );
});

test('it refuses every request when its counter store is down', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies({ text: 'never sent', usage: { input_tokens: 1, output_tokens: 1 } });

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  await rm(ctx.directory, { recursive: true, force: true });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(503);

  const body: unknown = await response.json();

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'api_error',
      message: 'the counting proxy cannot read its counter store, so it refuses every request',
    },
  });

  expect(ctx.model.requests).toHaveLength(0);
});

test('it refuses every request when its counter store holds no count it can read', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  await writeFile(ctx.storePath, '{"dollars":');

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(503);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it answers a 502 and refuses every later request when a reply body breaks before its usage arrives', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          pull: (controller) => {
            controller.error(new Error('connection reset'));
          },
        }),
        { headers: { 'content-type': 'application/json' } },
      ),
    ),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  const broken = await sendRequest();
  const later = await sendRequest();

  expect(broken.status).toBe(502);
  expect(later.status).toBe(503);
  expect(sendUpstream).toHaveBeenCalledOnce();
});

test('it refuses every later request when a streamed reply breaks before its usage arrives', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          pull: (controller) => {
            controller.error(new Error('connection reset'));
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    ),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [], stream: true }),
      }),
    );

  const broken = await sendRequest();

  const read = await broken.text().then(
    () => null,
    (error: unknown) => error,
  );

  const later = await sendRequest();

  expect(read).toBeInstanceOf(Error);
  expect(later.status).toBe(503);
  expect(sendUpstream).toHaveBeenCalledOnce();
});

test('it refuses every later request once a count fails to write, even after the store comes back', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const gate = Promise.withResolvers<undefined>();

  ctx.model.addReplies(
    { text: 'lost', usage: { input_tokens: 10, output_tokens: 10 }, gate: gate.promise },
    { text: 'never sent', usage: { input_tokens: 10, output_tokens: 10 } },
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  const pending = sendRequest();

  await rm(ctx.directory, { recursive: true, force: true });

  gate.resolve(undefined);

  await pending;
  await mkdir(ctx.directory);
  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const response = await sendRequest();

  expect(response.status).toBe(503);
  expect(ctx.model.requests).toHaveLength(1);
});

test('it refuses a request for a model its route does not price', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-large', messages: [] }),
    }),
  );

  expect(response.status).toBe(400);

  const body: unknown = await response.json();

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message:
        'the counting proxy prices this route for model-small, so it refuses a request for model-large',
    },
  });

  expect(ctx.model.requests).toHaveLength(0);
});

test('it refuses a message request whose body names no model', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ messages: [] }),
    }),
  );

  const body: unknown = await response.json();

  expect(response.status).toBe(400);

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'invalid_request_error',
      message: 'the counting proxy needs a JSON body that names its model for messages',
    },
  });

  expect(ctx.model.requests).toHaveLength(0);
});

test.each([
  ['POST', '/v1/messages/batches'],
  ['GET', '/v1/messages/batches/msgbatch_example'],
  ['POST', '/v1/files'],
  ['DELETE', '/v1/models/model-small'],
])('it refuses %s %s, whose spend it cannot count, and sends nothing on', async (method, path) => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(new Request(`http://proxy.test/preview${path}`, { method }));

  expect(response.status).toBe(403);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it sends on a request for the model list', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  await handler(new Request('http://proxy.test/preview/v1/models'));

  expect(ctx.model.requests).toMatchObject([{ path: '/v1/models' }]);
});

test('it answers a path outside every route with a 404 and sends nothing on', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(404);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it sends a request on with its path past the route, its query and its credential header', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages/count_tokens?beta=true', {
      method: 'POST',
      headers: { authorization: 'Bearer placeholder-credential', 'accept-encoding': 'gzip' },
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  const body: unknown = await response.json();

  expect(body).toStrictEqual({ input_tokens: 10 });

  expect(ctx.model.requests).toMatchObject([
    {
      path: '/v1/messages/count_tokens',
      headers: {
        authorization: 'Bearer placeholder-credential',
        'accept-encoding': 'identity',
        host: new URL(ctx.model.url).host,
      },
    },
  ]);
});

test('it passes an upstream error through without counting it', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  ctx.model.addReplies({ refusal: 'the prompt is too long' });

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(400);

  const totals = await store.read();

  expect(totals).toStrictEqual({ dollars: 0, tokens: 0, lost: false });
});

test('it answers a 502 when the upstream cannot be reached', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://127.0.0.1:1',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(502);
});

test('it refuses every later request once a message call fails before its reply arrives', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.reject(new Error('connection reset')),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  const failed = await sendRequest();
  const later = await sendRequest();

  expect(failed.status).toBe(502);
  expect(later.status).toBe(503);
  expect(sendUpstream).toHaveBeenCalledOnce();
});

test('it refuses every request after a restart once a lost count marks its store', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.reject(new Error('connection reset')),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  // a handler on a store opened again stands for the proxy after a restart
  const restarted = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store: await createCounterStore(ctx.storePath),
    sendUpstream,
    log: ctx.log,
  });

  const response = await restarted(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  const body: unknown = await response.json();

  expect(response.status).toBe(503);

  expect(body).toStrictEqual({
    type: 'error',
    error: {
      type: 'api_error',
      message:
        'the counting proxy lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
    },
  });

  expect(sendUpstream).toHaveBeenCalledOnce();
});

test('it refuses every later request once a successful message reply holds usage it cannot read', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      Response.json({
        type: 'message',
        content: [{ type: 'text', text: 'unreadable usage' }],
        usage: { input_tokens: 'many', output_tokens: 12 },
      }),
    ),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  const sendRequest = () =>
    handler(
      new Request('http://proxy.test/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-small', messages: [] }),
      }),
    );

  const unreadable = await sendRequest();
  const later = await sendRequest();

  expect(unreadable.status).toBe(200);
  expect(later.status).toBe(503);
  expect(sendUpstream).toHaveBeenCalledOnce();
});

test('it keeps sending on after a call that spends nothing fails', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.reject(new Error('connection reset')),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    sendUpstream,
    log: ctx.log,
  });

  const sendRequest = () => handler(new Request('http://proxy.test/preview/v1/models'));

  const failed = await sendRequest();
  const later = await sendRequest();

  expect(failed.status).toBe(502);
  expect(later.status).toBe(502);
  expect(sendUpstream).toHaveBeenCalledTimes(2);
});
