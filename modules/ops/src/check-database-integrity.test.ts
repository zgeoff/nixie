import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { checkDatabaseIntegrity } from './check-database-integrity';

// a writer on a fresh data directory, migrated to the build's schema
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-ops-'));

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  return { writer };
}

test('it reports a sound database as ready', async () => {
  const ctx = await setupTest();

  const report = await checkDatabaseIntegrity(ctx.writer.db);

  expect(report).toStrictEqual({
    isReady: true,
    reason: null,
  });
});
