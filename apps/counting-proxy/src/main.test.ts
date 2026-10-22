import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'counting-proxy-cli-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  return { directory, model, entry: join(import.meta.dir, 'main.ts') };
}

test('it serves the routes of its config until SIGINT, then exits 0', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies({ text: 'from the cli', usage: { input_tokens: 600, output_tokens: 400 } });

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

  const child = Bun.spawn(
    [process.execPath, ctx.entry, '--config', join(ctx.directory, 'proxy.yaml')],
    { stdin: 'ignore', stdout: Bun.file(join(ctx.directory, 'stdout.log')), stderr: 'inherit' },
  );

  onTestFinished(() => {
    child.kill('SIGKILL');
  });

  await waitForCondition(async () => {
    const written = await readFile(join(ctx.directory, 'stdout.log'), 'utf8').catch(() => '');

    return written.includes('proxy.started');
  });

  const written = await readFile(join(ctx.directory, 'stdout.log'), 'utf8');

  const port = /"port":(?<port>\d+)/u.exec(written)?.groups?.['port'];

  const response = await fetch(`http://127.0.0.1:${String(port)}/preview/v1/messages`, {
    method: 'POST',
    body: JSON.stringify({ model: 'model-small', messages: [] }),
  });

  child.kill('SIGINT');

  const code = await child.exited;
  const stored = await Bun.file(join(ctx.directory, 'counter.json')).text();

  expect(response.status).toBe(200);
  expect(code).toBe(0);
  expect(stored).toBe('{"dollars":0.0026,"tokens":1000}');
});

test('it exits 1 for a config with no limit', async () => {
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

  const child = Bun.spawn(
    [process.execPath, ctx.entry, '--config', join(ctx.directory, 'proxy.yaml')],
    { stdin: 'ignore', stdout: 'ignore', stderr: 'ignore' },
  );

  const code = await child.exited;

  expect(code).toBe(1);
});
