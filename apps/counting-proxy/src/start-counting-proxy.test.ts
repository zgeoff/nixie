import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { startCountingProxy } from './start-counting-proxy';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'counting-proxy-'));

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

  const proxy = await startCountingProxy({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    drainTimeoutMs: 5000,
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
    startCountingProxy({
      configPath: join(ctx.directory, 'proxy.yaml'),
      log: ctx.log,
      drainTimeoutMs: 5000,
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

  const proxy = await startCountingProxy({
    configPath: join(ctx.directory, 'proxy.yaml'),
    log: ctx.log,
    drainTimeoutMs: 5000,
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
