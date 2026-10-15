import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { checkDatabase } from './check-database';

// a writer on a fresh data directory
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-ops-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it reports ready while the database answers', async () => {
  const ctx = await setupTest();
  const report = await checkDatabase(ctx.writer.db);

  expect(report).toStrictEqual({ isReady: true, reason: null });
});

test('it rejects once the database is closed', async () => {
  const ctx = await setupTest();

  await ctx.writer.stop();

  expect(checkDatabase(ctx.writer.db)).rejects.toThrow();
});
