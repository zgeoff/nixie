import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import type { ModelAPI } from '@heynixie/wire';
import { encodeCaptureTag, formatSpoolFileName, openSpoolFile } from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import type { CaptureSpool } from './create-capture-spool';
import { createCaptureSpool } from './create-capture-spool';
import { createCounterStore } from './create-counter-store';
import { makeProxyHandler } from './make-proxy-handler';

interface HandlerOptions {
  readonly capture: CaptureSpool | null;
  readonly sendUpstream: (url: string, init: RequestInit) => Promise<Response>;
  readonly api?: ModelAPI;
  readonly storeText?: string;
}

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const storePath = join(directory, 'counter.json');
  const log = mock<Logger>(() => {});
  const spoolDir = join(directory, 'spool');

  await mkdir(spoolDir);

  const recipient = await createSpoolRecipient();

  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';

  return {
    directory,
    model,
    storePath,
    log,
    spoolDir,
    recipient,
    captureID,
    segment: encodeCaptureTag({ captureID, sealTo: recipient.sealTo }),
    startSpool: () =>
      createCaptureSpool({
        config: { spool: spoolDir, maxBytes: 1_000_000, maxPending: 16 },
        log,
      }),
    makeHandler: async (options: HandlerOptions) => {
      await writeFile(storePath, options.storeText ?? '{"dollars":0,"tokens":0}');

      return makeProxyHandler({
        routes: {
          preview: {
            api: options.api ?? 'anthropic-messages',
            upstream: 'http://model.test',
            model: 'model-small',
            prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
          },
        },
        limits: { dollars: 1, tokens: null },
        store: await createCounterStore(storePath),
        capture: options.capture,
        sendUpstream: options.sendUpstream,
        log,
      });
    },
  };
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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

test.each([
  ['a whole reply', false],
  ['a streamed reply, from its completed event', true],
])(
  'it prices %s on a Responses route, its cache reads and writes taken out of the input',
  async (_case, isStream) => {
    const ctx = await setupTest();
    const store = await createCounterStore(ctx.storePath);

    ctx.model.addReplies({
      text: 'reviewed',
      responsesUsage: {
        input_tokens: 12_000,
        output_tokens: 900,
        input_tokens_details: {
          cached_tokens: 4000,
          cache_write_tokens: 7000,
          cache_write_tokens_details: { ttl_30m_tokens: 5000, ttl_12h_tokens: 2000 },
        },
        output_tokens_details: { reasoning_tokens: 600 },
      },
    });

    const handler = makeProxyHandler({
      routes: {
        review: {
          api: 'openai-responses',
          upstream: ctx.model.url,
          model: 'model-o',
          prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        },
      },
      limits: { dollars: 1, tokens: null },
      store,
      capture: null,
      sendUpstream: fetch,
      log: ctx.log,
    });

    const response = await handler(
      new Request('http://proxy.test/review/v1/responses', {
        method: 'POST',
        body: JSON.stringify({ model: 'model-o', stream: isStream, input: 'Review the plan.' }),
      }),
    );

    await response.text();

    // 1,000 × $1 + 4,000 × $0.10 + 5,000 × $1.25 + 2,000 × $2 + 900 × $5, per million tokens
    const totals = await store.read();

    expect(totals).toStrictEqual({ dollars: 0.01615, tokens: 12_900, lost: false });
  },
);

test('it refuses a background Responses request, whose reply holds no usage, and sends nothing on', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      review: {
        api: 'openai-responses',
        upstream: ctx.model.url,
        model: 'model-o',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/review/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-o', background: true, input: 'Review the plan.' }),
    }),
  );

  const refusal: unknown = await response.json();

  expect({ status: response.status, refusal, requests: ctx.model.requests.length }).toStrictEqual({
    status: 400,
    refusal: {
      type: 'error',
      error: {
        type: 'invalid_request_error',
        message:
          'the model gateway needs a JSON body that names its model and asks for no background response for responses',
      },
    },
    requests: 0,
  });
});

test('it refuses a Messages request on a Responses route and sends nothing on', async () => {
  const ctx = await setupTest();
  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      review: {
        api: 'openai-responses',
        upstream: ctx.model.url,
        model: 'model-o',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
    sendUpstream: fetch,
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/review/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-o', messages: [] }),
    }),
  );

  expect(response.status).toBe(403);
  expect(ctx.model.requests).toHaveLength(0);
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 0.01, tokens: null },
    store,
    capture: null,
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
        'the model gateway reached its spending limit ($0.0120 of $0.01), so it refuses every further request',
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: null, tokens: 1000 },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: null, tokens: 1000 },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
      message: 'the model gateway cannot read its counter store, so it refuses every request',
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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

  await waitForCondition(() => ctx.model.requests.length === 1);
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        'the model gateway prices this route for model-small, so it refuses a request for model-large',
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
      message: 'the model gateway needs a JSON body that names its model for messages',
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: ctx.model.url,
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://127.0.0.1:1',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store: await createCounterStore(ctx.storePath),
    capture: null,
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
        'the model gateway lost the count of a reply, so it refuses every request until an operator clears the mark in its counter store',
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
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

test('it sends a tagged Messages request on without the tag and leaves a sealed .cap file of its exact body', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sent: { url: string; body: Uint8Array }[] = [];

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: async (url, init) => {
      const bytes = await new Response(init.body).arrayBuffer();

      sent.push({ url, body: new Uint8Array(bytes) });

      return Response.json({ usage: { input_tokens: 3, output_tokens: 2 } });
    },
  });

  const bodyText =
    '{ "model":"model-small",  "messages":[{"role":"user","content":"marker-harbour-gull"}] }';

  const body = new TextEncoder().encode(bodyText);

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages?beta=true`, {
      method: 'POST',
      body,
    }),
  );

  await spool.settle();

  const names = await readdir(ctx.spoolDir);
  const file = await readFile(join(ctx.spoolDir, names[0] ?? ''));
  const opened = await openSpoolFile(new Uint8Array(file), ctx.recipient.privateKey);

  expect(response.status).toBe(200);
  expect(sent).toStrictEqual([{ url: 'http://model.test/v1/messages?beta=true', body }]);

  expect(names).toStrictEqual([
    formatSpoolFileName({
      kind: 'cap',
      captureID: ctx.captureID,
      writer: spool.writer,
      counter: 1,
      upstreamStatus: 200,
    }),
  ]);

  expect(opened?.body).toStrictEqual(body);

  expect(opened?.header).toMatchObject({
    route: 'preview',
    api: 'anthropic-messages',
    endpoint: 'messages',
    bytes: body.length,
  });

  expect(JSON.stringify(ctx.log.mock.calls)).not.toInclude('marker-harbour-gull');
});

test('it copies a tagged Responses request on a Responses route the same way', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sent: string[] = [];

  const handler = await ctx.makeHandler({
    capture: spool,
    api: 'openai-responses',
    sendUpstream: (url) => {
      sent.push(url);

      return Promise.resolve(Response.json({ usage: { input_tokens: 3, output_tokens: 2 } }));
    },
  });

  const body = new TextEncoder().encode('{"model":"model-small","input":"marker-harbour-gull"}');

  await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/responses`, {
      method: 'POST',
      body,
    }),
  );

  await spool.settle();

  const names = await readdir(ctx.spoolDir);
  const file = await readFile(join(ctx.spoolDir, names[0] ?? ''));
  const opened = await openSpoolFile(new Uint8Array(file), ctx.recipient.privateKey);

  expect(sent).toStrictEqual(['http://model.test/v1/responses']);
  expect(opened?.body).toStrictEqual(body);
  expect(opened?.header).toMatchObject({ api: 'openai-responses', endpoint: 'responses' });
  expect(JSON.stringify(ctx.log.mock.calls)).not.toInclude('marker-harbour-gull');
});

test('it writes no file for a request with no tag', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: () =>
      Promise.resolve(Response.json({ usage: { input_tokens: 3, output_tokens: 2 } })),
  });

  await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  await spool.settle();

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it removes a tag it cannot decode, sends the request on, and writes no file', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sent: string[] = [];

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: (url) => {
      sent.push(url);

      return Promise.resolve(Response.json({ usage: { input_tokens: 3, output_tokens: 2 } }));
    },
  });

  const response = await handler(
    new Request('http://proxy.test/preview/~in.not-a-tag/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  await spool.settle();

  expect(response.status).toBe(200);
  expect(sent).toStrictEqual(['http://model.test/v1/messages']);

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it removes the tag from a count_tokens request and copies it to no file', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sent: string[] = [];

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: (url) => {
      sent.push(url);

      return Promise.resolve(Response.json({ input_tokens: 4 }));
    },
  });

  await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages/count_tokens`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  await spool.settle();

  expect(sent).toStrictEqual(['http://model.test/v1/messages/count_tokens']);

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it removes the tag from a request that goes to a route with no capture key', async () => {
  const ctx = await setupTest();

  const sent: string[] = [];

  const handler = await ctx.makeHandler({
    capture: null,
    sendUpstream: (url) => {
      sent.push(url);

      return Promise.resolve(Response.json({ usage: { input_tokens: 3, output_tokens: 2 } }));
    },
  });

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(response.status).toBe(200);
  expect(sent).toStrictEqual(['http://model.test/v1/messages']);
});

test('it writes no file for a tagged request that names the wrong model', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(Response.json({})),
  );

  const handler = await ctx.makeHandler({ capture: spool, sendUpstream });

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-large', messages: [] }),
    }),
  );

  await spool.settle();

  expect(response.status).toBe(400);
  expect(sendUpstream).not.toHaveBeenCalled();

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it writes no file for a tagged request once the spending limit is reached', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(Response.json({})),
  );

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream,
    storeText: '{"dollars":2,"tokens":0}',
  });

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  await spool.settle();

  expect(response.status).toBe(403);
  expect(sendUpstream).not.toHaveBeenCalled();

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it refuses a tagged request to an endpoint outside the table, echoes its path, and writes no file', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(Response.json({})),
  );

  const handler = await ctx.makeHandler({ capture: spool, sendUpstream });

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages/batches`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small' }),
    }),
  );

  const refusal: unknown = await response.json();

  await spool.settle();

  expect(response.status).toBe(403);
  expect(JSON.stringify(refusal)).toInclude(`/~in.${ctx.segment}/v1/messages/batches`);
  expect(sendUpstream).not.toHaveBeenCalled();

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it leaves no file when the model API gives no response', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: () => Promise.reject(new Error('connection refused')),
  });

  const response = await handler(
    new Request(`http://proxy.test/preview/~in.${ctx.segment}/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  await spool.settle();

  expect(response.status).toBe(502);

  const left = await readdir(ctx.spoolDir);

  expect(left).toStrictEqual([]);
});

test('it answers the capture ask with yes for the configured folder', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();
  const handler = await ctx.makeHandler({ capture: spool, sendUpstream: fetch });

  const response = await handler(
    new Request(`http://proxy.test/~capture?spool=${encodeURIComponent(ctx.spoolDir)}`),
  );

  const answer: unknown = await response.json();

  expect(response.status).toBe(200);
  expect(answer).toStrictEqual({ canCapture: true });
});

test('it answers the capture ask with no for another folder and never names its own', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();
  const handler = await ctx.makeHandler({ capture: spool, sendUpstream: fetch });

  const response = await handler(
    new Request(`http://proxy.test/~capture?spool=${encodeURIComponent(ctx.directory)}`),
  );

  const text = await response.text();

  expect(text).toBe('{"canCapture":false}');
});

test('it answers the capture ask with no when the config holds no capture key', async () => {
  const ctx = await setupTest();
  const handler = await ctx.makeHandler({ capture: null, sendUpstream: fetch });

  const response = await handler(
    new Request(`http://proxy.test/~capture?spool=${encodeURIComponent(ctx.spoolDir)}`),
  );

  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ canCapture: false });
});

test('it answers the capture ask while the counter store is down', async () => {
  const ctx = await setupTest();
  const spool = await ctx.startSpool();

  const handler = await ctx.makeHandler({
    capture: spool,
    sendUpstream: fetch,
    storeText: 'broken',
  });

  const response = await handler(
    new Request(`http://proxy.test/~capture?spool=${encodeURIComponent(ctx.spoolDir)}`),
  );

  const answer: unknown = await response.json();

  expect(answer).toStrictEqual({ canCapture: true });
});

test('it answers the capture ask with a 400 when the spool query is missing', async () => {
  const ctx = await setupTest();
  const handler = await ctx.makeHandler({ capture: null, sendUpstream: fetch });
  const response = await handler(new Request('http://proxy.test/~capture'));
  const body: unknown = await response.json();

  expect(response.status).toBe(400);
  expect(body).toMatchObject({ type: 'error', error: { type: 'invalid_request_error' } });
});

test('it answers the capture ask with a 405 to a method other than GET', async () => {
  const ctx = await setupTest();
  const handler = await ctx.makeHandler({ capture: null, sendUpstream: fetch });

  const response = await handler(
    new Request(`http://proxy.test/~capture?spool=${encodeURIComponent(ctx.spoolDir)}`, {
      method: 'POST',
    }),
  );

  const body: unknown = await response.json();

  expect(response.status).toBe(405);
  expect(body).toMatchObject({ type: 'error', error: { type: 'invalid_request_error' } });
});
