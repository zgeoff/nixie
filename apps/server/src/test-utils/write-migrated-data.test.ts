import { expect, onTestFinished, test } from 'bun:test';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import type { RunTemplateOptions } from '@heynixie/testing';
import { createRunTemplate } from '@heynixie/testing';
import { readDataFiles } from './read-data-files';
import { writeMigratedData } from './write-migrated-data';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'migrated-data-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const io = {
    createTemplate: (options: RunTemplateOptions) =>
      createRunTemplate({ ...options, parentDir: join(directory, 'templates') }),
    startWriter,
    copyDirectory: (from: string, to: string) => cp(from, to, { recursive: true }),
  };

  return { dataDir: join(directory, 'data'), otherDir: join(directory, 'other'), io };
}

test('it writes a data directory that a writer opens with no migration left to run', async () => {
  const ctx = await setupTest();

  await writeMigratedData(ctx.dataDir, ctx.io);

  const writer = await startWriter({ dataDir: ctx.dataDir });

  onTestFinished(() => writer.stop());

  expect(writer.migration.from).toBeGreaterThan(0);
  expect(writer.migration.from).toBe(writer.migration.to);
});

test('it gives each data directory files of its own that a change to the other leaves alone', async () => {
  const ctx = await setupTest();

  await writeMigratedData(ctx.dataDir, ctx.io);
  await writeMigratedData(ctx.otherDir, ctx.io);

  const before = await readDataFiles(ctx.otherDir);

  await writeFile(join(ctx.dataDir, 'nixie.db'), 'a changed database');

  const after = await readDataFiles(ctx.otherDir);

  expect(before.map((file) => file.name)).toIncludeSameMembers(['nixie.db', 'keys.db']);
  expect(after).toStrictEqual(before);
});

test('it fails when the writer cannot migrate the template', async () => {
  const ctx = await setupTest();

  expect(
    writeMigratedData(ctx.dataDir, {
      ...ctx.io,
      startWriter: () => Promise.reject(new Error('the disk is full')),
    }),
  ).rejects.toThrow('the disk is full');
});
