import { expect, mock, onTestFinished, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, open, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { encodeCaptureTag, openSpoolFile, parseSpoolFileName } from '@heynixie/wire';
import { createSpoolRecipient } from '@heynixie/wire/test-utils';
import { startModelGateway } from './start-model-gateway';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  const log = mock<Logger>(() => {});
  let current = Date.parse('2026-11-13T10:00:00Z');

  return {
    directory,
    model,
    log,
    moveTo: (instant: string) => {
      current = Date.parse(instant);
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
          'caps: { day: { dollars: 120, tokens: 160000000 } }',
          `control: { listen: { port: 0 }, tokenFile: ${join(directory, 'token')} }`,
          'countBySandbox: true',
          `override: ${join(directory, 'override.json')}`,
          ...extra,
          'routes:',
          '  preview:',
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
        limits: {
          day: { dollars: 60, tokens: 80_000_000 },
          month: { dollars: 600, tokens: 600_000_000 },
        },
        readStore: (): Promise<unknown> => Bun.file(join(directory, 'counter.json')).json(),
      };
    },
  };
}

test('it serves its routes from a config file and writes each count to its store', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'counted', usage: { input_tokens: 600, output_tokens: 400 } });

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'limits: { dollars: 1 }',
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
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
  expect(stored).toBe('{"dollars":0.0026,"tokens":1000}');
});

test('it refuses every request once long prompts priced at their long-prompt rates reach the dollar limit', async () => {
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
      'limits: { dollars: 0.1 }',
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
    error: { message: expect.toInclude('($0.1050 of $0.1)') },
  });

  expect(ctx.model.requests).toHaveLength(2);
});

test('it refuses to start from a config with no limit', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'limits: {}',
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
  ).rejects.toThrow('the limits name no dollar or token limit');
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
      'limits: { dollars: 1 }',
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
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
  expect(stored).toBe('{"dollars":0.0026,"tokens":1000}');
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
      'limits: { dollars: 1 }',
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
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

test('it refuses every request after a restart once a stop cut off a reply at the drain deadline', async () => {
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
      'limits: { dollars: 1 }',
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
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
      body: JSON.stringify({ model: 'model-small', messages: [], stream: true }),
    }),
  ]);

  onTestFinished(() => reply);

  await waitForCondition(() => ctx.model.requests.length === 1);

  await proxy.stop();

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

  expect(response.status).toBe(503);
  expect(ctx.model.requests).toHaveLength(1);
});

test('it leaves the count unmarked when a stop finds no reply under way', async () => {
  const ctx = await setupTest();

  await writeFile(
    join(ctx.directory, 'proxy.yaml'),
    [
      'listen: { port: 0 }',
      `store: ${join(ctx.directory, 'counter.json')}`,
      'limits: { dollars: 1 }',
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
    ].join('\n'),
  );

  const proxy = await startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  await proxy.stop();

  const stored = await readFile(join(ctx.directory, 'counter.json'), 'utf8');

  expect(stored).toBe('{"dollars":0,"tokens":0}');
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
      'limits: { dollars: 1 }',
      'capture:',
      `  spool: ${spool}`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
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
      'limits: { dollars: 1 }',
      'capture:',
      `  spool: ${join(ctx.directory, 'missing')}`,
      'routes:',
      '  preview:',
      `    upstream: ${ctx.model.url}`,
      '    model: model-small',
      '    prices: { input: 1, cache_write: 1.25, cache_write_1h: 2, cached_input: 0.1, output: 5 }',
    ].join('\n'),
  );

  const starting = startModelGateway({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    waitForDrainDeadline: () => Promise.resolve(),
  });

  expect(starting).rejects.toThrow();
});

test('it refuses every request with a 503 and sends nothing upstream while no limit is set', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  const response = await gateway.send('alpha');

  expect(response.status).toBe(503);
  expect(ctx.model.requests).toHaveLength(0);
});

test('it counts a reply on the day, the month and the sandbox in one write', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'counted', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/limits', gateway.limits);
  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  const response = await gateway.send('alpha');

  await response.text();

  const stored = await gateway.readStore();

  expect(stored).toMatchObject({
    periods: { day: { dollars: 0.0026, tokens: 1000 }, month: { dollars: 0.0026, tokens: 1000 } },
    sandboxes: { alpha: { dollars: 0.0026, tokens: 1000 } },
  });
});

test('it strips the sandbox and route segments before it calls the model', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'ok', usage: { input_tokens: 1, output_tokens: 1 } });

  await gateway.control('PUT', '/limits', gateway.limits);
  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  expect(ctx.model.requests.map((request) => request.path)).toStrictEqual(['/v1/messages']);
});

test('it refuses with a 403 a sandbox the store lacks and sends nothing upstream', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  await gateway.control('PUT', '/limits', gateway.limits);

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

  await gateway.control('PUT', '/limits', gateway.limits);
  await gateway.control('PUT', '/sandboxes/alpha', { limit: { dollars: 2, tokens: 1000 } });
  await gateway.control('PUT', '/sandboxes/beta', { limit: null });
  await gateway.exchange('alpha');

  const refused = await gateway.send('alpha');
  const other = await gateway.send('beta');

  expect(refused.status).toBe(403);
  expect(other.status).toBe(200);
});

test('it refuses with the limit 403 once a period reaches its limit and passes again once a raise lifts it', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 1, output_tokens: 1 } },
  );

  await gateway.control('PUT', '/limits', {
    day: { dollars: 60, tokens: 1000 },
    month: gateway.limits.month,
  });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  const refused = await gateway.send('alpha');

  await gateway.control('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 5000 },
  });

  const passed = await gateway.send('alpha');

  expect([refused.status, passed.status]).toStrictEqual([403, 200]);
});

test('it keeps refusing a raise past the cap, and so the stop, while the cap holds', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies({ text: 'first', usage: { input_tokens: 600, output_tokens: 400 } });

  await gateway.control('PUT', '/limits', {
    day: { dollars: 60, tokens: 1000 },
    month: gateway.limits.month,
  });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  const raise = await gateway.control('POST', '/raise', {
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 90, tokens: 160_000_001 },
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

  await gateway.control('PUT', '/limits', {
    day: { dollars: 60, tokens: 1000 },
    month: gateway.limits.month,
  });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  await writeFile(
    join(ctx.directory, 'override.json'),
    JSON.stringify({
      period: 'day',
      start: '2026-11-13',
      limit: { dollars: 500, tokens: 900_000_000 },
    }),
  );

  const lifted = await gateway.send('alpha');

  await lifted.text();

  // the next day the override is stale, and the new day starts from zero under the base limit
  ctx.moveTo('2026-11-14T09:00:00Z');

  const nextDay = await gateway.send('alpha');

  expect([lifted.status, nextDay.status]).toStrictEqual([200, 200]);

  const stored = await gateway.readStore();

  expect(stored).toMatchObject({
    periods: { day: { start: '2026-11-14', tokens: 2 } },
  });
});

test('it refuses again a day later at the base limit once a stale override no longer applies', async () => {
  const ctx = await setupTest();
  const gateway = await ctx.startPeriods();

  ctx.model.addReplies(
    { text: 'first', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'second', usage: { input_tokens: 600, output_tokens: 400 } },
    { text: 'third', usage: { input_tokens: 600, output_tokens: 400 } },
  );

  await gateway.control('PUT', '/limits', {
    day: { dollars: 60, tokens: 1000 },
    month: gateway.limits.month,
  });

  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });

  await writeFile(
    join(ctx.directory, 'override.json'),
    JSON.stringify({
      period: 'day',
      start: '2026-11-13',
      limit: { dollars: 500, tokens: 900_000_000 },
    }),
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

  await gateway.control('PUT', '/limits', gateway.limits);
  await gateway.control('PUT', '/sandboxes/alpha', { limit: null });
  await gateway.exchange('alpha');

  ctx.moveTo('2026-11-14T00:00:00Z');

  const status = await gateway.control('GET', '/status');

  expect(JSON.parse(status.body)).toMatchObject({
    periods: {
      day: { start: '2026-11-14', spent: { dollars: 0, tokens: 0 } },
      month: { spent: { tokens: 1000 } },
    },
  });
});

test('it keeps a capture tag working after the route when the path starts with a sandbox', async () => {
  const ctx = await setupTest();

  const spool = join(ctx.directory, 'spool');

  await mkdir(spool);

  const gateway = await ctx.startPeriods(['capture:', `  spool: ${spool}`]);

  ctx.model.addReplies({ text: 'captured', usage: { input_tokens: 6, output_tokens: 4 } });

  await gateway.control('PUT', '/limits', gateway.limits);
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
    body: JSON.stringify(gateway.limits),
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

  await expect(
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
