import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Logger } from '@heynixie/logger';
import { makeOverrideReader } from './make-override-reader';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'model-gateway-override-reader-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'override.json'), log: mock<Logger>(() => {}) };
}

test('it reads no override when the config names no file', async () => {
  const ctx = await setupTest();

  const readOverride = makeOverrideReader(null, ctx.log);

  const override = await readOverride();

  expect(override).toBeNull();
});

test('it reads the override that the file holds', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    '{"period":"day","start":"2026-11-13","limit":{"dollars":200,"tokens":250000000}}',
  );

  const readOverride = makeOverrideReader(ctx.path, ctx.log);

  const override = await readOverride();

  expect(override).toStrictEqual({
    period: 'day',
    start: '2026-11-13',
    limit: { dollars: 200, tokens: 250_000_000 },
  });
});

test('it binds nothing for a file with no valid override, and logs it once', async () => {
  const ctx = await setupTest();

  await writeFile(ctx.path, '{"period":"week"}');

  const readOverride = makeOverrideReader(ctx.path, ctx.log);
  const reads = [await readOverride(), await readOverride()];

  expect(reads).toStrictEqual([null, null]);

  expect(ctx.log.mock.calls).toStrictEqual([
    ['override.unreadable', { reason: 'the file holds no valid override' }, 'error'],
  ]);
});
