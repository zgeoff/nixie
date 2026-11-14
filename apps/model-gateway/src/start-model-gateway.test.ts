import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
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

  return { directory, model, log: mock<Logger>(() => {}) };
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
