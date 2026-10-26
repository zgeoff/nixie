import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import { writeMigratedData } from './write-migrated-data';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'migrated-data-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it writes a data directory that a writer opens with no migration left to run', async () => {
  const ctx = await setupTest();

  await writeMigratedData(ctx.dataDir);

  const writer = await startWriter({ dataDir: ctx.dataDir });

  onTestFinished(() => writer.stop());

  expect(writer.migration.from).toBeGreaterThan(0);
  expect(writer.migration.from).toBe(writer.migration.to);
});

test('it gives each data directory a database of its own', async () => {
  const ctx = await setupTest();
  const otherDir = await mkdtemp(join(tmpdir(), 'migrated-data-'));

  onTestFinished(() => rm(otherDir, { recursive: true, force: true }));

  await writeMigratedData(ctx.dataDir);
  await writeMigratedData(otherDir);

  const writer = await startWriter({ dataDir: ctx.dataDir });

  await writer.stop();

  const other = await startWriter({ dataDir: otherDir });

  onTestFinished(() => other.stop());

  expect(other.epoch).toBe(writer.epoch);
});
