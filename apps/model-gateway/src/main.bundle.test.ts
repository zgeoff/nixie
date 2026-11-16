import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startScriptedModel, waitForCondition } from '@heynixie/testing';
import { readModelGatewayBinary } from './test-utils/read-model-gateway-binary';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-binary-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const model = startScriptedModel();

  onTestFinished(() => model.stop());

  return { directory, model, binary: await readModelGatewayBinary() };
}

test('it serves a periods config, refuses until the limits are set, and exits 0 on SIGINT, as a compiled binary', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.directory, 'token'), 'control-secret\n');

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

  const child = Bun.spawn([ctx.binary, '--config', join(ctx.directory, 'proxy.yaml')], {
    stdin: 'ignore',
    stdout: Bun.file(join(ctx.directory, 'stdout.log')),
    stderr: 'inherit',
  });

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

  await response.body?.cancel();

  child.kill('SIGINT');

  const code = await child.exited;

  expect([response.status, code]).toStrictEqual([503, 0]);
});
