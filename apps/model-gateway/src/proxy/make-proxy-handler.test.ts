import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import type { ModelAPI } from '@heynixie/wire';
import { encodeCaptureTag, formatSpoolFileName, openSpoolFile } from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { createPlanLogin } from '../login/create-plan-login';
import { writeLoginFile } from '../login/write-login-file';
import { createPeriodStore } from '../periods/create-period-store';
import { buildLoginFile } from '../test-utils/build-login-file';
import { buildTestJWT } from '../test-utils/build-test-jwt';
import type { CaptureSpool } from '../usage/create-capture-spool';
import { createCaptureSpool } from '../usage/create-capture-spool';
import { createCounterStore } from '../usage/create-counter-store';
import { makeOpenReplies } from './make-open-replies';
import { makeProxyHandler } from './make-proxy-handler';

interface HandlerOptions {
  readonly capture: CaptureSpool | null;
  readonly sendUpstream: (url: string, init: RequestInit) => Promise<Response>;
  readonly api?: ModelAPI;
  readonly storeText?: string;
  readonly providerPin?: string;
}

interface LimitsRoute {
  readonly api: ModelAPI;
  readonly maxOutputTokens: number | null;
}

interface Ask {
  readonly body: Readonly<Record<string, unknown>>;
  readonly bodyText?: string;
  readonly providerPin?: string;
  readonly headers?: Readonly<Record<string, string>>;
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

  const makeHandler = async (options: HandlerOptions) => {
    await writeFile(storePath, options.storeText ?? '{"dollars":0,"tokens":0}');

    return makeProxyHandler({
      routes: {
        preview: {
          api: options.api ?? 'anthropic-messages',
          upstream: 'http://model.test',
          model: 'model-small',
          providerPin: options.providerPin ?? null,
          prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
          maxOutputTokens: null,
          login: null,
        },
      },
      limits: { dollars: 1, tokens: null },
      store: await createCounterStore(storePath),
      capture: options.capture,
      sendUpstream: options.sendUpstream,
      log,
    });
  };

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
    ask: async (ask: Ask) => {
      let upstreamCalls = 0;

      const handler = await makeHandler({
        capture: null,
        ...(ask.providerPin === undefined ? {} : { providerPin: ask.providerPin }),
        sendUpstream: () => {
          upstreamCalls += 1;

          return Promise.resolve(
            Response.json({ id: 'msg_1', usage: { input_tokens: 10, output_tokens: 2 } }),
          );
        },
      });

      const response = await handler(
        new Request('http://proxy.test/preview/v1/messages', {
          method: 'POST',
          headers: ask.headers ?? {},
          body: ask.bodyText ?? JSON.stringify({ model: 'model-small', messages: [], ...ask.body }),
        }),
      );

      return { response, upstreamCalls };
    },
    makeHandler,

    // a Responses route that holds a plan login, whose refresh answers with `refresh`
    startPlanHandler: async (
      options: {
        upstreamStatus?: number;
        login?: Parameters<typeof buildLoginFile>[0];
        refresh?: () => Response;
        now?: () => number;
      } = {},
    ) => {
      await writeFile(storePath, '{"dollars":0,"tokens":0}');

      const loginPath = join(directory, 'plan-login.json');
      const routeKeyFile = join(directory, 'plan-key');

      await writeFile(routeKeyFile, 'route-key-1\n');
      await writeLoginFile(loginPath, buildLoginFile(options.login));

      const clock = options.now ?? (() => Date.parse('2026-11-14T10:00:00Z'));
      const refreshes: string[] = [];
      let issued = 0;

      const planLogin = await createPlanLogin({
        routeID: 'codex-plan',
        config: { file: loginPath, routeKeyFile },
        send: (_url, init) => {
          refreshes.push(String(init.body));

          issued += 1;

          const token = buildTestJWT({
            jti: `access-${String(issued)}`,
            exp: clock() / 1000 + 3600,
          });

          const issuedAnswer = Response.json({
            access_token: token,
            refresh_token: `refresh-token-${String(issued + 1)}`,
          });

          return Promise.resolve(options.refresh?.() ?? issuedAnswer);
        },
        now: clock,
        sleep: () => Promise.resolve(),
        log,
      });

      const upstreamCalls: { url: string; headers: Headers; body: string }[] = [];

      const handler = makeProxyHandler({
        routes: {
          'codex-plan': {
            api: 'openai-responses',
            upstream: 'http://chatgpt.test/backend-api/codex',
            model: 'model-o',
            providerPin: null,
            prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
            maxOutputTokens: 1000,
            login: { file: loginPath, routeKeyFile },
          },
        },
        planLogins: { 'codex-plan': planLogin },
        limits: { dollars: 1, tokens: null },
        store: await createCounterStore(storePath),
        capture: null,
        sendUpstream: async (url, init) => {
          upstreamCalls.push({
            url,
            headers: new Headers(init.headers),
            body: await new Response(init.body).text(),
          });

          return options.upstreamStatus === undefined || options.upstreamStatus === 200
            ? Response.json({ id: 'resp_1', usage: { input_tokens: 10, output_tokens: 2 } })
            : new Response('{}', { status: options.upstreamStatus });
        },
        log,
      });

      return {
        upstreamCalls,
        refreshes,
        loginPath,
        ask: (
          init: {
            authorization?: string | null;
            path?: string;
            method?: string;
            body?: unknown;
          } = {},
        ) =>
          handler(
            new Request(`http://proxy.test${init.path ?? '/codex-plan/responses'}`, {
              method: init.method ?? 'POST',
              headers:
                init.authorization === null
                  ? { 'x-api-key': 'placeholder' }
                  : { authorization: init.authorization ?? 'Bearer route-key-1' },
              body:
                init.method === 'GET'
                  ? null
                  : JSON.stringify(init.body ?? { model: 'model-o', input: 'Review the plan.' }),
            }),
          ),
      };
    },
    startLimitsHandler: async (
      route: LimitsRoute,
      sendUpstream: (url: string, init: RequestInit) => Promise<Response>,
    ) => {
      await writeFile(storePath, '{"dollars":0,"tokens":0}');

      const store = await createCounterStore(storePath);

      const handler = makeProxyHandler({
        routes: {
          preview: {
            api: route.api,
            upstream: 'http://model.test',
            model: 'model-small',
            providerPin: null,
            prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
            maxOutputTokens: route.maxOutputTokens,
            login: null,
          },
        },
        limits: { dollars: 1, tokens: null },
        store,
        capture: null,
        sendUpstream,
        log,
      });

      return { handler, store };
    },
    startPeriodsHandler: async (
      sendUpstream: (url: string, init: RequestInit) => Promise<Response>,
      upstream = 'http://model.test',
    ) => {
      const store = await createPeriodStore({
        path: storePath,
        zone: 'Europe/London',
        now: () => Date.parse('2026-11-13T10:00:00Z'),
        readOverride: () => Promise.resolve(null),
        log,
      });

      await store.change((held) => ({
        store: {
          ...held,
          periods: {
            day: { ...held.periods.day, limit: { dollars: 60, tokens: 1_000_000 } },
            month: { ...held.periods.month, limit: { dollars: 600, tokens: 10_000_000 } },
          },
          sandboxes: { alpha: { dollars: 0, tokens: 0, limit: null } },
        },
        result: undefined,
      }));

      const handler = makeProxyHandler({
        routes: {
          preview: {
            api: 'anthropic-messages',
            upstream,
            model: 'model-small',
            providerPin: null,
            prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
            maxOutputTokens: null,
            login: null,
          },
        },
        periods: { store, countBySandbox: true, log },
        capture: null,
        sendUpstream,
        log,
      });

      return { handler, store };
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
          providerPin: null,
          prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
          maxOutputTokens: null,
          login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

test('it answers a 502 and counts the estimate, so the next request passes, when a reply body breaks before its usage arrives', async () => {
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        body: JSON.stringify({ model: 'model-small', messages: [], max_tokens: 1000 }),
      }),
    );

  const broken = await sendRequest();
  const later = await sendRequest();
  const counted = await store.read();

  // 4,151 input tokens at the highest input rate, $2, and 1,000 output tokens at $5, per million
  expect([broken.status, later.status, counted.lost, counted.tokens]).toStrictEqual([
    502,
    502,
    false,
    10_302,
  ]);

  expect(sendUpstream).toHaveBeenCalledTimes(2);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.013302, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({
      route: 'preview',
      sandbox: null,
      reason: 'body_failed',
      tokens: 5151,
    }),
    'warn',
  );
});

test('it counts the estimate, so the next request passes, when a streamed reply breaks before its usage arrives', async () => {
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        body: JSON.stringify({
          model: 'model-small',
          messages: [],
          stream: true,
          max_tokens: 1000,
        }),
      }),
    );

  const broken = await sendRequest();

  const read = await broken.text().then(
    () => null,
    (error: unknown) => error,
  );

  const later = await sendRequest();
  const counted = await store.read();

  // 4,165 input tokens at the highest input rate, $2, and 1,000 output tokens at $5, per million
  expect(read).toBeInstanceOf(Error);
  expect([later.status, counted.lost, counted.tokens]).toStrictEqual([200, false, 5165]);
  expect(sendUpstream).toHaveBeenCalledTimes(2);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.01333, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({ route: 'preview', sandbox: null, reason: 'cut', tokens: 5165 }),
    'warn',
  );
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

test('it counts the estimate, so the next request passes, once a message call fails before its reply arrives', async () => {
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        body: JSON.stringify({ model: 'model-small', messages: [], max_tokens: 1000 }),
      }),
    );

  const failed = await sendRequest();
  const later = await sendRequest();
  const counted = await store.read();

  expect([failed.status, later.status, counted.lost, counted.tokens]).toStrictEqual([
    502,
    502,
    false,
    10_302,
  ]);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.013302, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({
      route: 'preview',
      sandbox: null,
      reason: 'upstream_failed',
      tokens: 5151,
    }),
    'warn',
  );
});

test('it admits a request again once an operator removes the lost mark, with no restart', async () => {
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

  await sendRequest();
  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');
  await sendRequest();

  expect(sendUpstream).toHaveBeenCalledTimes(2);
});

test('it refuses a request that arrives while the lost mark is still being written', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const counter = await createCounterStore(ctx.storePath);

  const markWrite = Promise.withResolvers<undefined>();
  const markCalled = Promise.withResolvers<undefined>();

  const store = {
    ...counter,
    markLost: async () => {
      markCalled.resolve(undefined);

      await markWrite.promise;

      await counter.markLost();
    },
  };

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.reject(new Error('connection reset')),
  );

  const handler = makeProxyHandler({
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

  const failed = sendRequest();

  await markCalled.promise;

  const during = await sendRequest();

  markWrite.resolve(undefined);

  await failed;

  expect(during.status).toBe(503);
});

test('it refuses every request after a restart once a lost count marks its store', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.reject(new Error('connection reset')),
  );

  const seeded = await createCounterStore(ctx.storePath);

  await seeded.markLost();

  // a handler on a store opened again stands for the proxy after a restart
  const restarted = makeProxyHandler({
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

  expect(sendUpstream).not.toHaveBeenCalled();
});

test('it counts the estimate, so the next request passes, once a successful message reply holds usage it cannot read', async () => {
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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
        body: JSON.stringify({ model: 'model-small', messages: [], max_tokens: 1000 }),
      }),
    );

  const unreadable = await sendRequest();
  const later = await sendRequest();
  const counted = await store.read();

  expect([unreadable.status, later.status, counted.lost, counted.tokens]).toStrictEqual([
    200,
    200,
    false,
    10_302,
  ]);

  expect(sendUpstream).toHaveBeenCalledTimes(2);
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
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
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

test.each([
  ['a Claude route', 'claude', '{ "model":"model-small",  "system":[{"type":"text","text":"a"}] }'],
  [
    'a route outside Claude, with its provider order',
    'router',
    '{"model":"model-small","system":[{"type":"text","text":"a"}],"provider":{"order":["z-ai"],"allow_fallbacks":false}}',
  ],
])('it sends the body of %s upstream byte for byte', async (_label, route, bodyText) => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const sent: Uint8Array[] = [];
  const prices = { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 };

  const handler = makeProxyHandler({
    routes: {
      claude: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        providerPin: null,
        prices,
        maxOutputTokens: null,
        login: null,
      },
      router: {
        api: 'anthropic-messages',
        upstream: 'http://router.test',
        model: 'model-small',
        providerPin: 'z-ai',
        prices,
        maxOutputTokens: null,
        login: null,
      },
    },
    limits: { dollars: 1, tokens: null },
    store: await createCounterStore(ctx.storePath),
    capture: null,
    sendUpstream: async (_url, init) => {
      const bytes = await new Response(init.body).arrayBuffer();

      sent.push(new Uint8Array(bytes));

      return Response.json({ usage: { input_tokens: 3, output_tokens: 2 } });
    },
    log: ctx.log,
  });

  const body = new TextEncoder().encode(bodyText);

  await handler(new Request(`http://proxy.test/${route}/v1/messages`, { method: 'POST', body }));

  expect(sent).toStrictEqual([body]);
});

test.each([
  ['models', { models: ['model-large'] }],
  ['fallbacks', { fallbacks: ['model-large'] }],
  ['route', { route: 'fallback' }],
  ['plugins', { plugins: [{ id: 'fusion' }] }],
])('it refuses a request that sets %s and sends nothing on', async (_field, body) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 400,
    upstreamCalls: 0,
  });
});

test.each([
  ['a route with no pin', undefined, { order: ['example-host'], allow_fallbacks: false }],
  ['another pin', 'example-host', { order: ['other-host'], allow_fallbacks: false }],
  [
    'a second order entry',
    'example-host',
    { order: ['example-host', 'other-host'], allow_fallbacks: false },
  ],
  ['fallbacks on', 'example-host', { order: ['example-host'], allow_fallbacks: true }],
  [
    'an extra key',
    'example-host',
    { order: ['example-host'], allow_fallbacks: false, sort: 'price' },
  ],
  ['an empty order', 'example-host', { order: [], allow_fallbacks: false }],
  ['a string for an object', 'example-host', 'example-host'],
])('it refuses a provider with %s and sends nothing on', async (_title, providerPin, provider) => {
  const ctx = await setupTest();

  const answer = await ctx.ask({
    body: { provider },
    ...(providerPin === undefined ? {} : { providerPin }),
  });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 400,
    upstreamCalls: 0,
  });
});

test.each([
  ['a second model', '{"model":"model-large","messages":[],"model":"model-small"}'],
  [
    'a second model under an escaped key',
    String.raw`{"model":"model-large","messages":[],"model":"model-small"}`,
  ],
  [
    'a second provider',
    '{"model":"model-small","messages":[],"provider":{"order":["other-host"]},"provider":{"order":["example-host"],"allow_fallbacks":false}}',
  ],
  [
    'a tool entry with a second type',
    '{"model":"model-small","messages":[],"tools":[{"name":"ask","input_schema":{},"type":"image_generation","type":"custom"}]}',
  ],
])(
  'it refuses a body that repeats a key to hide %s, and sends nothing on',
  async (_title, bodyText) => {
    const ctx = await setupTest();
    const answer = await ctx.ask({ body: {}, bodyText, providerPin: 'example-host' });

    expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
      status: 400,
      upstreamCalls: 0,
    });
  },
);

test('it sends on and counts a request that holds the exact pinned provider', async () => {
  const ctx = await setupTest();

  const answer = await ctx.ask({
    body: { provider: { order: ['example-host'], allow_fallbacks: false } },
    providerPin: 'example-host',
  });

  const store = await createCounterStore(ctx.storePath);
  const totals = await store.read();

  expect({
    status: answer.response.status,
    upstreamCalls: answer.upstreamCalls,
    totals,
  }).toStrictEqual({
    status: 200,
    upstreamCalls: 1,
    totals: { dollars: 0.00002, tokens: 12, lost: false },
  });
});

test.each([
  ['speed fast', { speed: 'fast' }],
  ['service tier priority', { service_tier: 'priority' }],
  ['service tier flex', { service_tier: 'flex' }],
  ['service tier scale', { service_tier: 'scale' }],
  ['inference geo us', { inference_geo: 'us' }],
])('it refuses a request with %s and sends nothing on', async (_title, body) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 400,
    upstreamCalls: 0,
  });
});

test.each([
  ['speed standard', { speed: 'standard' }],
  ['speed null', { speed: null }],
  ['service tier auto', { service_tier: 'auto' }],
  ['service tier standard_only', { service_tier: 'standard_only' }],
  ['service tier default', { service_tier: 'default' }],
  ['service tier null', { service_tier: null }],
  ['inference geo global', { inference_geo: 'global' }],
  ['inference geo null', { inference_geo: null }],
  [
    'a namespace of function tools',
    {
      tools: [
        {
          type: 'namespace',
          name: 'nixie',
          tools: [{ type: 'function', name: 'note_read', parameters: {} }],
        },
      ],
    },
  ],
])('it sends on a request with %s', async (_title, body) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 200,
    upstreamCalls: 1,
  });
});

test.each([
  [
    'an advisor tool that names another model',
    {
      tools: [{ type: 'advisor_20260301', name: 'advisor', model: 'model-large' }],
      tool_choice: { type: 'tool', name: 'advisor' },
    },
  ],
  ['an advisor tool with no model', { tools: [{ type: 'advisor_20260301', name: 'advisor' }] }],
  ['an openrouter server tool', { tools: [{ type: 'openrouter:web_search' }] }],
  ['a tool with a model key', { tools: [{ name: 'ask', model: 'model-large', input_schema: {} }] }],
  ['an image generation tool with no model key', { tools: [{ type: 'image_generation' }] }],
  ['a web search server tool', { tools: [{ type: 'web_search_20250305', name: 'web_search' }] }],
  [
    'a namespace that holds a server tool',
    { tools: [{ type: 'namespace', name: 'nixie', tools: [{ type: 'image_generation' }] }] },
  ],
  ['a tool that is not an object', { tools: ['image_generation'] }],
])('it refuses %s and sends nothing on', async (_title, body) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 400,
    upstreamCalls: 0,
  });
});

test.each([
  [
    'a custom tool whose input schema has a model property',
    {
      tools: [
        {
          name: 'run_worker',
          description: 'Run a worker.',
          input_schema: { type: 'object', properties: { model: { type: 'string' } } },
        },
      ],
    },
  ],
  [
    'a message whose tool use input holds a model key',
    {
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'toolu_1',
              name: 'run_worker',
              input: { model: 'model-large' },
            },
          ],
        },
      ],
    },
  ],
])('it sends on %s', async (_title, body) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 200,
    upstreamCalls: 1,
  });
});

test.each([
  ['authorization first', { authorization: 'Bearer placeholder', 'x-api-key': 'guest-key' }],
  ['x-api-key first', { 'x-api-key': 'guest-key', authorization: 'Bearer placeholder' }],
])(
  'it refuses a request with 2 credential headers, %s, and sends nothing on',
  async (_title, headers) => {
    const ctx = await setupTest();
    const answer = await ctx.ask({ body: {}, headers });

    expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
      status: 400,
      upstreamCalls: 0,
    });
  },
);

test.each([
  ['authorization', { authorization: 'Bearer placeholder' }],
  ['x-api-key', { 'x-api-key': 'placeholder' }],
])('it sends on a request with only %s', async (_title, headers) => {
  const ctx = await setupTest();
  const answer = await ctx.ask({ body: {}, headers });

  expect({ status: answer.response.status, upstreamCalls: answer.upstreamCalls }).toStrictEqual({
    status: 200,
    upstreamCalls: 1,
  });
});

// Each fixture is a body that a pinned CLI sent through nixie's own guest, with only the
// environment text, paths and device IDs replaced and the model renamed to the route's.
test.each([
  {
    title: "the Agent SDK CLI's conversation turn",
    fixture: 'claude-cli-messages.json',
    api: 'anthropic-messages',
    path: '/v1/messages?beta=true',
    headers: { 'x-api-key': 'placeholder' },
    pin: {},
  },
  {
    title: "the Agent SDK CLI's turn with a provider pin",
    fixture: 'claude-cli-pinned-provider.json',
    api: 'anthropic-messages',
    path: '/v1/messages?beta=true',
    headers: { 'x-api-key': 'placeholder' },
    pin: { providerPin: 'z-ai' },
  },
  {
    title: "the Codex CLI's turn",
    fixture: 'codex-cli-responses.json',
    api: 'openai-responses',
    path: '/v1/responses',
    headers: { authorization: 'Bearer placeholder' },
    pin: {},
  },
] as const)('it sends on and counts the exact body of $title', async (row) => {
  const ctx = await setupTest();
  const bodyText = await readFile(join(import.meta.dir, '..', 'fixtures', row.fixture), 'utf8');

  const sent: string[] = [];

  const handler = await ctx.makeHandler({
    capture: null,
    api: row.api,
    ...row.pin,
    sendUpstream: async (_url, init) => {
      const text = await new Response(init.body).text();

      sent.push(text);

      return Response.json({ id: 'reply_1', usage: { input_tokens: 10, output_tokens: 2 } });
    },
  });

  const response = await handler(
    new Request(`http://proxy.test/preview${row.path}`, {
      method: 'POST',
      headers: row.headers,
      body: bodyText,
    }),
  );

  const store = await createCounterStore(ctx.storePath);
  const totals = await store.read();

  expect({ status: response.status, sent, totals }).toStrictEqual({
    status: 200,
    sent: [bodyText],
    totals: { dollars: 0.00002, tokens: 12, lost: false },
  });
});

test('it counts the estimate of a Messages stream that breaks after its message start, per sandbox, and admits the next request', async () => {
  const ctx = await setupTest();

  const encoder = new TextEncoder();

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(
        new ReadableStream<Uint8Array>({
          pull: (controller) => {
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({
                  type: 'message_start',
                  message: { usage: { input_tokens: 100, output_tokens: 1 } },
                })}\n\n`,
              ),
            );

            controller.error(new Error('connection reset'));
          },
        }),
        { headers: { 'content-type': 'text/event-stream' } },
      ),
    ),
  );

  const started = await ctx.startPeriodsHandler(sendUpstream);

  const sendRequest = () =>
    started.handler(
      new Request('http://proxy.test/alpha/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'model-small',
          messages: [],
          stream: true,
          max_tokens: 1000,
        }),
      }),
    );

  const broken = await sendRequest();

  await broken.text().catch(() => null);

  const later = await sendRequest();
  const counted = await started.store.read();

  // 4,165 input tokens, the body's 69 bytes and the allowance, and 1,000 output tokens
  expect([later.status, counted.lost, counted.sandboxes['alpha']?.tokens]).toStrictEqual([
    200,
    false,
    5165,
  ]);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.01333, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({ route: 'preview', sandbox: 'alpha', reason: 'cut', tokens: 5165 }),
    'warn',
  );
});

test('it counts the estimate of a Messages stream whose last delta holds no output count, pricing the start event input on an Anthropic route', async () => {
  const ctx = await setupTest();

  const events = [
    { type: 'message_start', message: { usage: { input_tokens: 9000, output_tokens: 1 } } },
    { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} },
  ];

  const sendUpstream = mock<(url: string, init: RequestInit) => Promise<Response>>(() =>
    Promise.resolve(
      new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(''), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    ),
  );

  const started = await ctx.startPeriodsHandler(sendUpstream, 'https://api.anthropic.com');

  const sendRequest = () =>
    started.handler(
      new Request('http://proxy.test/alpha/preview/v1/messages', {
        method: 'POST',
        body: JSON.stringify({
          model: 'model-small',
          messages: [],
          stream: true,
          max_tokens: 1000,
        }),
      }),
    );

  const ended = await sendRequest();

  await ended.text();

  const later = await sendRequest();
  const counted = await started.store.read();

  // 9,000 input tokens from the start event at the input rate, and 1,000 output tokens at the
  // output rate; the byte bound of 4,165 tokens at the highest input rate would cost more
  expect([later.status, counted.lost, counted.sandboxes['alpha']?.tokens]).toStrictEqual([
    200,
    false,
    10_000,
  ]);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.014, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({
      route: 'preview',
      sandbox: 'alpha',
      reason: 'no_usage',
      tokens: 10_000,
    }),
    'warn',
  );
});

test('it counts the estimate from the route maxOutputTokens for a Responses stream cut before its final event', async () => {
  const ctx = await setupTest();

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

  const started = await ctx.startLimitsHandler(
    { api: 'openai-responses', maxOutputTokens: 8192 },
    sendUpstream,
  );

  const response = await started.handler(
    new Request('http://proxy.test/preview/v1/responses', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', stream: true, input: 'Review the plan.' }),
    }),
  );

  await response.text().catch(() => null);

  const counted = await started.store.read();

  // the body's 64 bytes and the 4,096 allowance in, and the route's 8,192 tokens out
  expect([counted.tokens, counted.lost]).toStrictEqual([4160 + 8192, false]);
  expect(counted.dollars).toBeCloseTo((4160 * 2 + 8192 * 5) / 1_000_000, 9);
});

test.each([
  ['no usage block', { id: 'msg_1', type: 'message' }],
  [
    'usage of another shape, as a router reports it',
    { id: 'msg_1', usage: { prompt_tokens: 120, completion_tokens: 30 } },
  ],
])('it counts the estimate for a whole reply with %s', async (_case, reply) => {
  const ctx = await setupTest();

  const started = await ctx.startLimitsHandler(
    { api: 'anthropic-messages', maxOutputTokens: null },
    () => Promise.resolve(Response.json(reply)),
  );

  const response = await started.handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [], max_tokens: 1000 }),
    }),
  );

  const counted = await started.store.read();

  expect([response.status, counted.lost, counted.tokens]).toStrictEqual([200, false, 5151]);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({ route: 'preview', reason: 'no_usage', tokens: 5151 }),
    'warn',
  );
});

test('it marks the count lost and names the field when a reply with no usage answers a request with an image by URL', async () => {
  const ctx = await setupTest();

  const started = await ctx.startPeriodsHandler(() =>
    Promise.resolve(Response.json({ id: 'msg_1' })),
  );

  const response = await started.handler(
    new Request('http://proxy.test/alpha/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({
        model: 'model-small',
        max_tokens: 1000,
        messages: [
          {
            role: 'user',
            content: [{ type: 'image', source: { type: 'url', url: 'https://img.test/a.png' } }],
          },
        ],
      }),
    }),
  );

  const counted = await started.store.read();

  expect([response.status, counted.lost]).toStrictEqual([200, true]);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.lost',
    { route: 'preview', sandbox: 'alpha', field: 'messages.content.source' },
    'error',
  );
});

test.each([
  {
    title: 'a whole body whose usage holds only its input count',
    buildReply: () => Response.json({ type: 'message', usage: { input_tokens: 9000 } }),
  },
  {
    title: 'a stream that ends cleanly after its message start',
    buildReply: () =>
      new Response(
        `data: ${JSON.stringify({
          type: 'message_start',
          message: { usage: { input_tokens: 9000, output_tokens: 1 } },
        })}\n\n`,
        { headers: { 'content-type': 'text/event-stream' } },
      ),
  },
])('it charges the input it reported and the output bound for $title', async (row) => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const handler = makeProxyHandler({
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
    sendUpstream: () => Promise.resolve(row.buildReply()),
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [], max_tokens: 1000 }),
    }),
  );

  await response.text();

  const counted = await store.read();

  // 9,000 reported input tokens at $2 and 1,000 output tokens at $5, per million
  expect([counted.tokens, counted.lost]).toStrictEqual([10_000, false]);
  expect(counted.dollars).toBeCloseTo(0.023, 9);
});

test('it charges the usage a stream reported when a stop cuts it off, and a later cancel adds nothing', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.storePath, '{"dollars":0,"tokens":0}');

  const store = await createCounterStore(ctx.storePath);

  const openReplies = makeOpenReplies();

  const handler = makeProxyHandler({
    routes: {
      preview: {
        api: 'anthropic-messages',
        upstream: 'http://model.test',
        model: 'model-small',
        providerPin: null,
        prices: { input: 1, cacheWrite: 1.25, cacheWrite1h: 2, cachedInput: 0.1, output: 5 },
        maxOutputTokens: null,
        login: null,
      },
    },
    limits: { dollars: 1, tokens: null },
    store,
    capture: null,
    openReplies,
    sendUpstream: () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start: (controller) => {
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({
                    type: 'message_start',
                    message: { usage: { input_tokens: 9000, output_tokens: 1 } },
                  })}\n\n`,
                ),
              );
            },
          }),
          { headers: { 'content-type': 'text/event-stream' } },
        ),
      ),
    log: ctx.log,
  });

  const response = await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [], stream: true, max_tokens: 1000 }),
    }),
  );

  const reader = response.body?.getReader();

  await reader?.read();
  await openReplies.countAtStop();
  await reader?.cancel();

  const counted = await store.read();

  expect([counted.tokens, counted.lost]).toStrictEqual([10_000, false]);
  expect(counted.dollars).toBeCloseTo(0.023, 9);
});

test('it sends a plan request upstream with the access token in place of the route key', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler();
  const response = await plan.ask();

  expect(response.status).toBe(200);

  expect(plan.upstreamCalls).toStrictEqual([
    {
      url: 'http://chatgpt.test/backend-api/codex/responses',
      headers: expect.any(Headers),
      body: JSON.stringify({ model: 'model-o', input: 'Review the plan.' }),
    },
  ]);

  expect(
    Object.fromEntries(plan.upstreamCalls[0]?.headers.entries() ?? [])['authorization'],
  ).toStartWith('Bearer ');

  const authorization = plan.upstreamCalls[0]?.headers.get('authorization') ?? '';

  expect(authorization).toStartWith('Bearer ');
  expect(authorization).not.toContain('route-key-1');
  expect(plan.refreshes).toHaveLength(1);
});

test('it counts a plan request under the route prices', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler();
  const response = await plan.ask();

  await response.text();

  const totals = await createCounterStore(ctx.storePath).then((store) => store.read());

  // 10 × $1 + 2 × $5, per million tokens
  expect(totals).toStrictEqual({ dollars: 0.00002, tokens: 12, lost: false });
});

test.each([
  ['a wrong key', 'Bearer other-key'],
  ['no authorization header', null],
  ['a key of another length', 'Bearer route-key-10'],
])(
  'it refuses a plan request with %s with a 403 and sends nothing upstream',
  async (_name, authorization) => {
    const ctx = await setupTest();
    const plan = await ctx.startPlanHandler();
    const response = await plan.ask({ authorization });

    expect(response.status).toBe(403);
    expect(plan.upstreamCalls).toHaveLength(0);
    expect(plan.refreshes).toHaveLength(0);
  },
);

test('it refuses the model list on a plan route with a 403 and sends nothing upstream', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler();
  const response = await plan.ask({ method: 'GET', path: '/codex-plan/models' });

  expect(response.status).toBe(403);
  expect(plan.upstreamCalls).toHaveLength(0);
});

test('it answers a plan request with a 401 when the login needs a login, and sends nothing upstream', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler({ login: { status: 'needs_login', reason: 'refused' } });
  const response = await plan.ask();

  expect(response.status).toBe(401);

  const result = await response.json();

  expect(result).toStrictEqual({
    type: 'error',
    error: { type: 'authentication_error', message: expect.stringContaining('chatgpt-login') },
  });

  expect(plan.upstreamCalls).toHaveLength(0);
});

test('it refuses a plan request that sets a service tier with a 400', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler();

  const response = await plan.ask({
    body: { model: 'model-o', input: 'Review the plan.', service_tier: 'priority' },
  });

  expect(response.status).toBe(400);
  expect(plan.upstreamCalls).toHaveLength(0);
});

test('it starts a refresh when the upstream answers 401, once the token is old enough', async () => {
  const ctx = await setupTest();

  let current = Date.parse('2026-11-14T10:00:00Z');

  const plan = await ctx.startPlanHandler({ upstreamStatus: 401, now: () => current });

  await plan.ask();

  expect(plan.refreshes).toHaveLength(1);

  current += 5 * 60_000;

  const response = await plan.ask();

  expect(response.status).toBe(401);
  expect(plan.refreshes).toHaveLength(2);
});

test('it starts no refresh when the upstream answers 401 for a token under 5 minutes old', async () => {
  const ctx = await setupTest();
  const plan = await ctx.startPlanHandler({ upstreamStatus: 401 });

  await plan.ask();
  await plan.ask();

  expect(plan.refreshes).toHaveLength(1);
});

test('it sets no credential on a route that holds no plan login', async () => {
  const ctx = await setupTest();

  const sent: Record<string, string>[] = [];

  const handler = await ctx.makeHandler({
    capture: null,
    sendUpstream: (_url, init) => {
      sent.push(Object.fromEntries(new Headers(init.headers).entries()));

      return Promise.resolve(
        Response.json({ id: 'msg_1', usage: { input_tokens: 1, output_tokens: 1 } }),
      );
    },
  });

  await handler(
    new Request('http://proxy.test/preview/v1/messages', {
      method: 'POST',
      headers: { authorization: 'Bearer caller-credential' },
      body: JSON.stringify({ model: 'model-small', messages: [] }),
    }),
  );

  expect(sent.map((headers) => headers['authorization'])).toStrictEqual([
    'Bearer caller-credential',
  ]);
});
