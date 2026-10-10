import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Migration } from '@heynixie/db';
import { sql } from 'kysely';
import { startWriter } from './start-writer';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-writer-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir, stubServer: join(import.meta.dir, 'test-utils', 'run-stub-server.ts') };
}

test('it refuses to start when statfs reports a network filesystem', async () => {
  const ctx = await setupTest();

  const start = startWriter({
    dataDir: ctx.dataDir,
    readFilesystemType: () => ({ type: 0x69_69 }),
  });

  await start.catch(() => {});

  const names = await readdir(ctx.dataDir);

  expect(start).rejects.toThrowWithMessage(
    Error,
    `data directory ${ctx.dataDir} is on a network filesystem (nfs), and nixie needs a local one`,
  );
  expect(names).toStrictEqual([]);
});

test('it exits a second process on the same data directory with the writer lock error', async () => {
  const ctx = await setupTest();

  const first = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], { stdout: 'pipe' });

  onTestFinished(async () => {
    first.kill('SIGKILL');
    await first.exited;
  });

  const ready = await first.stdout.getReader().read();

  expect(new TextDecoder().decode(ready.value)).toBe('writer epoch 1\n');

  const second = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const exitCode = await second.exited;
  const stderr = await new Response(second.stderr).text();

  expect(exitCode).not.toBe(0);
  expect(stderr).toInclude('WriterLockHeldError: writer lock held by another process');
});

test('it takes the lock and the next epoch once the process that held them dies', async () => {
  const ctx = await setupTest();

  const first = Bun.spawn([process.execPath, ctx.stubServer, ctx.dataDir], { stdout: 'pipe' });

  await first.stdout.getReader().read();
  first.kill('SIGKILL');
  await first.exited;

  const writer = await startWriter({ dataDir: ctx.dataDir });

  onTestFinished(() => writer.stop());

  expect(writer.epoch).toBe(2);
});

test('it raises the writer epoch before the first migration runs', async () => {
  const ctx = await setupTest();

  const seen: number[] = [];
  const writer = await startWriter({
    dataDir: ctx.dataDir,
    schema: {
      migrations: [
        {
          name: 'read the writer epoch',
          up: async (tx) => {
            const result = await sql<{ epoch: number }>`select epoch from writer_epoch`.execute(tx);

            seen.push(...result.rows.map((row) => row.epoch));
          },
        },
      ],
      oldestReader: 0,
    },
  });

  onTestFinished(() => writer.stop());

  expect(seen).toStrictEqual([writer.epoch]);
});

test('it copies the database before the first migration of a release and never the key store', async () => {
  const ctx = await setupTest();

  const createNotes: Migration = {
    name: 'create notes',
    up: async (tx) => {
      await sql`create table notes (id text primary key)`.execute(tx);
    },
  };

  await writeFile(join(ctx.dataDir, 'keys'), 'the wrapped record keys');

  const release1 = await startWriter({
    dataDir: ctx.dataDir,
    schema: { migrations: [createNotes], oldestReader: 0 },
  });

  await release1.stop();

  const release2 = await startWriter({
    dataDir: ctx.dataDir,
    schema: {
      migrations: [
        createNotes,
        {
          name: 'create tags',
          up: async (tx) => {
            await sql`create table tags (id text primary key)`.execute(tx);
          },
        },
      ],
      oldestReader: 0,
    },
  });

  await release2.stop();

  const names = await readdir(ctx.dataDir);

  expect(release2.migration).toStrictEqual({
    from: 1,
    to: 2,
    copyPath: join(ctx.dataDir, 'nixie-schema-1.db'),
  });
  expect(names.toSorted()).toStrictEqual(['keys', 'nixie-schema-1.db', 'nixie.db']);
});
