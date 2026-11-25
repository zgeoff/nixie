import { expect, mock, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { encodeCaptureTag, openSpoolFile, parseSpoolFileName } from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { writeLoginFile } from '../login/write-login-file';
import { buildLoginFile } from '../test-utils/build-login-file';
import { buildTestJWT } from '../test-utils/build-test-jwt';
import { startModelGateway } from './start-model-gateway';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  await writeFile(join(directory, 'token'), 'control-secret\n');

  const log = mock<Logger>(() => {});
  let current = Date.parse('2026-11-13T10:00:00Z');

  return {
    directory,
    model,
    log,

    // the keys that every periods config sets before its routes
    periodsHeader: [
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
    ],
    moveTo: (instant: string) => {
      current = Date.parse(instant);
    },

    // a gateway with periods, a control listener and a plan route whose refresh `authFetch` answers
    startPlan: async (
      options: {
        routeKey?: string;
        authFetch?: (url: string, init: RequestInit) => Promise<Response>;
      } = {},
    ) => {
      await writeFile(join(directory, 'token'), 'control-secret\n');
      await writeFile(join(directory, 'plan-key'), options.routeKey ?? 'route-key-1\n');
      await writeLoginFile(join(directory, 'plan-login.json'), buildLoginFile());

      await writeFile(
        join(directory, 'proxy.yaml'),
        [
          'listen: { port: 0 }',
          `store: ${join(directory, 'counter.json')}`,
          'periods: { zone: Europe/London }',
          `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
          'countBySandbox: true',
          'routes:',
          '  codex-plan:',
          '    api: openai-responses',
          `    upstream: ${model.url}/v1`,
          '    model: model-o',
          '    maxOutputTokens: 1000',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '    limits: { day: 60, month: 600 }',
          '    login:',
          `      file: ${join(directory, 'plan-login.json')}`,
          `      routeKeyFile: ${join(directory, 'plan-key')}`,
        ].join('\n'),
      );

      const proxy = await startModelGateway({
        configPath: join(directory, 'proxy.yaml'),
        log,
        now: () => current,
        authFetch:
          options.authFetch ??
          (() =>
            Promise.resolve(
              Response.json({
                access_token: buildTestJWT({ jti: 'access-1', exp: current / 1000 + 3600 }),
                refresh_token: 'refresh-token-2',
              }),
            )),
        waitForDrainDeadline: () => Promise.resolve(),
      });

      onTestFinished(() => proxy.stop());

      return proxy;
    },

    // a gateway with periods, a control listener and a route to the scripted model; the config
    // lines in `extra` follow the route and may name a capture
    startPeriods: async (
      extra: readonly string[] = [],
      waitForDrainDeadline: () => Promise<void> = () => Promise.resolve(),
    ) => {
      await writeFile(join(directory, 'token'), 'control-secret\n');

      await writeFile(
        join(directory, 'proxy.yaml'),
        [
          'listen: { port: 0 }',
          `store: ${join(directory, 'counter.json')}`,
          'periods: { zone: Europe/London }',
          `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
          'countBySandbox: true',
          `override: ${join(directory, 'override.json')}`,
          ...extra,
          'routes:',
          '  preview:',
          `    upstream: ${model.url}`,
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '    limits: { day: 0.002, month: 60 }',
          '  other:',
          `    upstream: ${model.url}`,
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
          '    limits: { day: 60, month: 600 }',
          '  bare:',
          `    upstream: ${model.url}`,
          '    model: model-small',
          '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
        ].join('\n'),
      );

      const proxy = await startModelGateway({
        configPath: join(directory, 'proxy.yaml'),
        log,
        now: () => current,
        waitForDrainDeadline,
      });

      onTestFinished(() => proxy.stop());

      const controlURL = proxy.controlURL ?? '';

      return {
        proxy,
        send: (sandbox: string, path = 'preview/v1/messages') =>
          fetch(`${proxy.url}/${sandbox}/${path}`, {
            method: 'POST',
            body: JSON.stringify({ model: 'model-small', messages: [] }),
          }),
        control: async (method: string, path: string, body?: unknown) => {
          const response = await fetch(`${controlURL}${path}`, {
            method,
            headers: { authorization: 'Bearer control-secret' },
            body: body === undefined ? null : JSON.stringify(body),
          });

          const text = await response.text();

          return { status: response.status, body: text };
        },
        exchange: async (sandbox: string, path = 'preview/v1/messages') => {
          const response = await fetch(`${proxy.url}/${sandbox}/${path}`, {
            method: 'POST',
            body: JSON.stringify({ model: 'model-small', messages: [] }),
          });

          await response.text();

          return response.status;
        },
        readStore: (): Promise<unknown> => Bun.file(join(directory, 'counter.json')).json(),
      };
    },
  };
}

test('it serves its routes from a config file and writes the count of each route to its store', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'counted', usage: { input_tokens: 600, output_tokens: 400 } });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  onTestFinished(() => proxy.stop());

  const response = await fetch(`${proxy.url}/preview/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-small', messages: [] }),
  });

  const body: unknown = await response.json();
  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(body).toMatchObject({ content: [{ type: 'text', text: 'counted' }] });

  expect(JSON.parse(stored)).toMatchObject({
    routes: { preview: { day: { micros: 2600 }, month: { micros: 2600 } } },
  });
});

test('it refuses every request on the route once long prompts priced at their long-prompt rates reach its day limit', async () => {
  const ctx = await setupTest();

  // at the base rates two of these replies would count $0.0210 and leave the limit unreached
  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 100_001, output_tokens: 1000 } },
    { text: 'second', usage: { input_tokens: 100_001, output_tokens: 1000 } },
    { text: 'third', usage: { input_tokens: 100_001, output_tokens: 1000 } },
  );

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: claude-haiku-5-5',
      '    prices:',
      '      input: 0.1',
      '      cache_write: 0.125',
      '      cache_write_1h: 0.2',
      '      cached_input: 0.01',
      '      output: 0.5',
      '      long_prompt:',
      '        over_tokens: 100000',
      '        input: 0.5',
      '        cache_write: 0.625',
      '        cache_write_1h: 1',
      '        cached_input: 0.05',
      '        output: 2.5',
      '    limits: { day: 0.1, month: 600 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  onTestFinished(() => proxy.stop());

  const sendRequest = () =>
    fetch(`${proxy.url}/preview/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'claude-haiku-5-5', messages: [] }),
    });

  const first = await sendRequest();

  await first.text();

  const second = await sendRequest();

  await second.text();

  const refused = await sendRequest();
  const body: unknown = await refused.json();

  expect(refused.status).toBe(403);

  expect(body).toMatchObject({
    error: { type: 'limit_reached', counter: 'route_day', route: 'preview' },
  });

  expect(ctx.model.requests).toHaveLength(2);
});

test('it refuses to start from a config with a limit that spans routes', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'limits: { dollars: 1 }',
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  expect(
    startModelGateway({
      configPath: join(ctx.directory, 'proxy.yaml'),
      log: ctx.log,
      waitForDrainDeadline: () => Promise.resolve(),
    }),
  ).rejects.toThrow('no limit spans routes');
});

test('it lets a streamed reply under way finish and counts it before a stop resolves', async () => {
  const ctx = await setupTest();

  const gate = Promise.withResolvers<undefined>();

  ctx.model.addReplies({
    text: 'drained',
    usage: { input_tokens: 600, output_tokens: 400 },
    gate: gate.promise,
  });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  // the drain deadline never passes, so the stop resolves only once the reply has ended
  const deadline = Promise.withResolvers<undefined>();

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => deadline.promise,
  });

  onTestFinished(async () => {
    deadline.resolve(undefined);
    gate.resolve(undefined);

    await proxy.stop();
  });

  const reply = fetch(`${proxy.url}/preview/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-small', messages: [], stream: true }),
  });

  await waitForCondition(() => ctx.model.requests.length === 1);

  const stopped = proxy.stop();

  gate.resolve(undefined);

  await stopped;

  const response = await reply;
  const body = await response.text();
  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(response.status).toBe(200);
  expect(body).toInclude('event: message_stop');

  expect(JSON.parse(stored)).toMatchObject({
    routes: { preview: { day: { micros: 2600 } } },
  });
});

test('it closes a reply that outlasts the drain deadline and resolves the stop', async () => {
  const ctx = await setupTest();

  // the reply never starts until the test ends
  const gate = Promise.withResolvers<undefined>();

  ctx.model.addReplies({
    text: 'never sent',
    usage: { input_tokens: 600, output_tokens: 400 },
    gate: gate.promise,
  });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const deadline = Promise.withResolvers<undefined>();

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => deadline.promise,
  });

  onTestFinished(async () => {
    deadline.resolve(undefined);
    gate.resolve(undefined);

    await proxy.stop();
  });

  // settled at once, so the reply's failure is held until the test reads it
  const reply = Promise.allSettled([
    fetch(`${proxy.url}/preview/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [], stream: true }),
    }),
  ]);

  await waitForCondition(() => ctx.model.requests.length === 1);

  const stopped = proxy.stop();

  deadline.resolve(undefined);

  await stopped;

  const [settled] = await reply;

  expect(settled?.status).toBe('rejected');
});

test('it charges the estimate of a reply a stop cut off at the drain deadline, and serves the next start', async () => {
  const ctx = await setupTest();

  // the reply never starts until the test ends
  const gate = Promise.withResolvers<undefined>();

  ctx.model.addReplies(
    { text: 'cut off', usage: { input_tokens: 600, output_tokens: 400 }, gate: gate.promise },
    { text: 'never sent', usage: { input_tokens: 600, output_tokens: 400 } },
  );

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  onTestFinished(async () => {
    gate.resolve(undefined);

    await proxy.stop();
  });

  // settled at once, so the reply's failure is held until the test ends
  const reply = Promise.allSettled([
    fetch(`${proxy.url}/preview/v1/messages`, {
      method: 'POST',
      body: JSON.stringify({ model: 'model-small', messages: [], stream: true, max_tokens: 1000 }),
    }),
  ]);

  onTestFinished(() => reply);

  await waitForCondition(() => ctx.model.requests.length === 1);

  await proxy.stop();

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  const restarted = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  onTestFinished(() => restarted.stop());

  const response = await fetch(`${restarted.url}/preview/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-small', messages: [] }),
  });

  // the stream's body of 69 bytes and 4,096 allowance tokens in, and 1,000 tokens out
  expect(JSON.parse(stored)).toMatchObject({ routes: { preview: { day: { micros: 13_330 } } } });
  expect(response.status).toBe(200);
  expect(ctx.model.requests).toHaveLength(2);

  const estimated = ctx.log.mock.calls.find(([event]) => event === 'count.estimated');

  expect(estimated?.[1]?.['dollars']).toBeCloseTo(0.01333, 9);

  expect(ctx.log).toHaveBeenCalledWith(
    'count.estimated',
    expect.objectContaining({ route: 'preview', sandbox: null, reason: 'shutdown', tokens: 5165 }),
    'warn',
  );
});

test('it leaves the count unmarked when a stop finds no reply under way', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  await proxy.stop();

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(JSON.parse(stored)).toMatchObject({
    version: 3,
    routes: { preview: { day: { micros: 0 }, month: { micros: 0 } } },
    sandboxes: {},
  });

  expect(JSON.parse(stored)).not.toHaveProperty('lost');
});

test('it captures a tagged request to its spool, answers the capture ask, and logs that it captures', async () => {
  const ctx = await setupTest();

  const spool = join(ctx.directory, 'spool');

  await mkdir(spool);

  ctx.model.addReplies({ text: 'captured', usage: { input_tokens: 6, output_tokens: 4 } });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'capture:',
      `  spool: ${spool}`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  const recipient = await createSpoolRecipient();

  const captureID = '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3';
  const segment = encodeCaptureTag({ captureID, sealTo: recipient.sealTo });
  const body = JSON.stringify({ model: 'model-small', messages: [] });

  const ask = await fetch(`${proxy.url}/~capture?spool=${encodeURIComponent(spool)}`);
  const answer: unknown = await ask.json();

  await fetch(`${proxy.url}/preview/~in.${segment}/v1/messages`, { method: 'POST', body });

  await proxy.stop();

  const names = await readdir(spool);
  const file = await readFile(join(spool, names[0] ?? ''));
  const opened = await openSpoolFile(new Uint8Array(file), recipient.privateKey);

  expect(answer).toStrictEqual({ canCapture: true });
  expect(names.map((name) => parseSpoolFileName(name)?.kind)).toStrictEqual(['cap']);
  expect(new TextDecoder().decode(opened?.body)).toBe(body);
  expect(ctx.log).toHaveBeenCalledWith('proxy.started', expect.objectContaining({ capture: true }));
});

test('it refuses to start when its capture spool is not a folder it can write', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      ...ctx.periodsHeader,
      'capture:',
      `  spool: ${join(ctx.directory, 'missing')}`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
      '    limits: { day: 60, month: 600 }',
    ].join('\n'),
  );

  const starting = startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  expect(starting).rejects.toThrow();
});

test('it refuses every request on a route with no limit with a 503 and sends nothing upstream', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  const response = await gateway.send('alpha', 'bare/v1/messages');

  expect(response.status).toBe(503);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it counts a reply on its route day and month and on its sandbox in one write', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'counted', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  const response = await gateway.send('alpha', 'other/v1/messages');

  await response.text();

  const stored = await gateway.readStore();

  expect(stored).toMatchObject({
    routes: {
      other: { day: { micros: 2600 }, month: { micros: 2600 } },
      preview: { day: { micros: 0 } },
    },
    sandboxes: { alpha: { micros: 2600, tokens: 1000 } },
  });
});

test('it strips the sandbox and route segments before it calls the model', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  expect(ctx.model.requests.map((request) => request.path)).toStrictEqual(['/v1/messages']);
});

test('it refuses with a 403 a sandbox the store lacks and sends nothing upstream', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();
  const response = await gateway.send('ghost');

  expect(response.status).toBe(403);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it refuses a sandbox past its own limit with the limit 403 while another sandbox still passes', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'other', usage: { input_tokens: 1, output_tokens: 1 } },
  );

  await gateway.control('PUT', '/sandboxes/alpha', { limit: { dollars: 0.001, tokens: 1000 } });
  await gateway.control('PUT', '/sandboxes/beta', { limit: null });
  await gateway.exchange('alpha', 'other/v1/messages');

  const refused = await gateway.send('alpha', 'other/v1/messages');
  const other = await gateway.send('beta', 'other/v1/messages');

  expect([refused.status, other.status]).toStrictEqual([403, 200]);
});

test('it refuses the route at its day limit with limit_reached naming the route, and a turn on the other route completes', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'other route', usage: { input_tokens: 1, output_tokens: 1 } },
  );

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  const refused = await gateway.send('alpha');
  const refusedBody: unknown = await refused.json();
  const other = await gateway.send('alpha', 'other/v1/messages');

  expect([refused.status, refusedBody, other.status]).toStrictEqual([
    403,
    {
      type: 'error',
      error: {
        type: 'limit_reached',
        counter: 'route_day',
        route: 'preview',
        message: expect.stringContaining('preview'),
      },
    },
    200,
  ]);

  expect(ctx.model.requests).toHaveLength(2);
});

test('it reports the refusal on the sandbox count and the trip on the route status', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'first', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');
  await gateway.send('alpha');

  const sandbox = await gateway.control('GET', '/sandboxes/alpha');
  const status = await gateway.control('GET', '/status');

  expect([JSON.parse(sandbox.body), JSON.parse(status.body)]).toMatchObject([
    {
      lastRefusal: {
        counter: 'route_day',
        route: 'preview',
        atMs: Date.parse('2026-11-13T10:00:00Z'),
      },
    },
    {
      routes: {
        preview: { day: { tripped: true, limit: 0.002 } },
        other: { day: { tripped: false, limit: 60 } },
      },
    },
  ]);
});

test('it passes again once a raise of the route lifts its day limit, and the raise names the route', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 1, output_tokens: 1 } },
  );

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  const refused = await gateway.send('alpha');

  await gateway.control('POST', '/raise', {
    route: 'preview',
    start: '2026-11-13',
    dollars: 0.004,
  });

  const passed = await gateway.send('alpha');

  expect([refused.status, passed.status]).toStrictEqual([403, 200]);
});

test('it keeps refusing a raise past the route cap, and so the stop, while the cap holds', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'first', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  const raise = await gateway.control('POST', '/raise', {
    route: 'preview',
    start: '2026-11-13',
    dollars: 0.0041,
  });

  const refused = await gateway.send('alpha');

  expect([raise.status, refused.status]).toStrictEqual([409, 403]);
});

test('it lets a request pass above the cap once the host override lifts the limit, and ignores the override the next day', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 1, output_tokens: 1 } },
    { text: 'third', usage: { input_tokens: 1, output_tokens: 1 } },
  );

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  await writeFile(
    join(ctx.directory, 'override.json'),
    JSON.stringify({ preview: { start: '2026-11-13', dollars: 500 } }),
  );

  const lifted = await gateway.send('alpha');

  await lifted.text();

  // the next day the override is stale, and the new day starts from zero under the configured limit
  ctx.moveTo('2026-11-14T09:00:00Z');

  const nextDay = await gateway.send('alpha');

  expect([lifted.status, nextDay.status]).toStrictEqual([200, 200]);

  const stored = await gateway.readStore();

  expect(stored).toMatchObject({ routes: { preview: { day: { start: '2026-11-14' } } } });
});

test('it refuses again a day later at the configured limit once a stale override no longer applies', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'third', usage: { input_tokens: 600, output_tokens: 400 } },
  );

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  await writeFile(
    join(ctx.directory, 'override.json'),
    JSON.stringify({ preview: { start: '2026-11-13', dollars: 500 } }),
  );

  await gateway.exchange('alpha');
  await gateway.exchange('alpha');

  ctx.moveTo('2026-11-14T09:00:00Z');

  const nextDayFirst = await gateway.send('alpha');

  await nextDayFirst.text();

  const nextDaySecond = await gateway.send('alpha');

  expect([nextDayFirst.status, nextDaySecond.status]).toStrictEqual([200, 403]);
});

test('it reaches the reset with no request: a status read after midnight shows a zero count', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'first', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  ctx.moveTo('2026-11-14T00:00:00Z');

  const status = await gateway.control('GET', '/status');

  expect(JSON.parse(status.body)).toMatchObject({
    routes: {
      preview: {
        day: { start: '2026-11-14', dollars: 0, tripped: false },
        month: { dollars: 0.0026 },
      },
    },
  });
});

test('it keeps a capture tag working after the route when the path starts with a sandbox', async () => {
  const ctx = await setupTest();

  const spool = join(ctx.directory, 'spool');

  await mkdir(spool);

  const gateway = await ctx.startPeriods(['capture:', `  spool: ${spool}`]);

  ctx.model.addReplies({ text: 'captured', usage: { input_tokens: 6, output_tokens: 4 } });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  const recipient = await createSpoolRecipient();

  const segment = encodeCaptureTag({
    captureID: '3f9c2a54-7b1e-4d68-9a0f-5e2c81b6d7a3',
    sealTo: recipient.sealTo,
  });

  const response = await gateway.send('alpha', `preview/~in.${segment}/v1/messages`);

  await response.text();
  await gateway.proxy.stop();

  const names = await readdir(spool);

  expect(ctx.model.requests.map((request) => request.path)).toStrictEqual(['/v1/messages']);
  expect(names.map((name) => parseSpoolFileName(name)?.kind)).toStrictEqual(['cap']);
});

test('it serves no control path on the model listener', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  const bare = await fetch(`${gateway.proxy.url}/status`, {
    headers: { authorization: 'Bearer control-secret' },
  });

  const underSandbox = await fetch(`${gateway.proxy.url}/alpha/status`, {
    headers: { authorization: 'Bearer control-secret' },
  });

  const limits = await fetch(`${gateway.proxy.url}/limits`, {
    method: 'PUT',
    headers: { authorization: 'Bearer control-secret' },
    body: JSON.stringify({}),
  });

  expect([bare.status, underSandbox.status, limits.status]).toStrictEqual([404, 404, 404]);
});

test('it answers a control request with no token with a 401 on the control listener', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();
  const response = await fetch(`${gateway.proxy.controlURL ?? ''}/status`);

  expect(response.status).toBe(401);
});

test('it refuses to start when the control token file holds no token', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'token'), '\n');

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'periods: { zone: Europe/London }',
      `control: { listen: { port: 0 }, tokenFile: ${join(ctx.directory, 'token')} }`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
    ].join('\n'),
  );

  expect(
    startModelGateway({
      configPath: join(ctx.directory, 'proxy.yaml'),
      log: ctx.log,
      waitForDrainDeadline: () => Promise.resolve(),
    }),
  ).rejects.toThrow(/token/u);
});

test('it lets a control reply under way finish before a stop resolves', async () => {
  const ctx = await setupTest();

  // the deadline never passes, so the stop resolves only once the control reply has ended
  const deadline = Promise.withResolvers<undefined>();
  const overridePath = join(ctx.directory, 'override.json');

  // a read of a named pipe waits for a writer, which holds the status reply under way
  execFileSync('mkfifo', [overridePath]);

  const gateway = await ctx.startPeriods([], () => deadline.promise);

  onTestFinished(() => {
    deadline.resolve(undefined);
  });

  const reply = gateway.control('GET', '/status');

  // opening the pipe for writing returns once the handler has opened it for reading
  const writer = await open(overridePath, 'w');

  const stopped = gateway.proxy.stop();

  await writer.writeFile('{}');
  await writer.close();

  await stopped;

  const answered = await reply;

  expect(answered.status).toBe(200);
});

test('it serves a plan route with its route key and reports the login on the control listener', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'planned', responsesUsage: { input_tokens: 10, output_tokens: 2 } });

  const proxy = await ctx.startPlan();

  await fetch(`${proxy.controlURL ?? ''}/limits`, {
    method: 'PUT',
    headers: { authorization: 'Bearer control-secret' },
    body: JSON.stringify({
      day: { dollars: 60, tokens: 80_000_000 },
      month: { dollars: 600, tokens: 600_000_000 },
    }),
  });

  await fetch(`${proxy.controlURL ?? ''}/sandboxes/alpha`, {
    method: 'PUT',
    headers: { authorization: 'Bearer control-secret' },
    body: JSON.stringify({ limit: null }),
  });

  const response = await fetch(`${proxy.url}/alpha/codex-plan/responses`, {
    method: 'POST',
    headers: { authorization: 'Bearer route-key-1' },
    body: JSON.stringify({ model: 'model-o', input: 'Plan it.' }),
  });

  const logins = await fetch(`${proxy.controlURL ?? ''}/chatgpt-logins`, {
    headers: { authorization: 'Bearer control-secret' },
  });

  expect(response.status).toBe(200);

  const result = await logins.json();

  expect(result).toStrictEqual({
    'codex-plan': {
      status: 'active',
      reason: null,
      since: '2026-11-13T09:12:00.000Z',
      accountID: 'acct-test-1',
      planType: 'plus',
    },
  });
});

test('it refuses a plan request that lacks the route key', async () => {
  const ctx = await setupTest();
  const proxy = await ctx.startPlan();

  const response = await fetch(`${proxy.url}/alpha/codex-plan/responses`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-o', input: 'Plan it.' }),
  });

  expect(response.status).toBe(403);
});

test.each(['/chatgpt-logins', '/alpha/chatgpt-logins', '/alpha/codex-plan/chatgpt-logins'])(
  'it serves no login path %s on the model listener',
  async (path) => {
    const ctx = await setupTest();
    const proxy = await ctx.startPlan();

    const response = await fetch(`${proxy.url}${path}`, {
      headers: { authorization: 'Bearer route-key-1' },
    });

    expect([403, 404]).toContain(response.status);

    const result = await response.text();

    expect(result).not.toContain('acct-test-1');
  },
);

test('it fails to start on a route key file that holds no key', async () => {
  const ctx = await setupTest();

  expect(ctx.startPlan({ routeKey: '\n' })).rejects.toThrow(/holds no key/u);
});
