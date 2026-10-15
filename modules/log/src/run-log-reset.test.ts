import { expect, onTestFinished, test } from 'bun:test';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { sql } from 'kysely';
import { readRecords } from './read-records';
import { runLogReset } from './run-log-reset';
import { startWriter } from './start-writer';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';
import { writeRecordsInTransaction } from './write-records-in-transaction';

function setupTest() {
  return startTestLog();
}

test('it removes every record and starts the new log at the old highest sequence plus 1', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'errands' },
    { kind: 'session.enrolled', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.log, [
        { kind: 'log_reset', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
      ]);
    },
  });

  const read = await readRecords(ctx.log, { afterSequence: 0 });

  expect(read.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [4, 'log_reset'],
  ]);
});

test('it returns the reset time and the old highest sequence', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  const reset = await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  expect(reset).toStrictEqual({ resetAt: expect.toBeValidDate(), lastSequence: 2 });
});

test('it hands the first records what the reset read before it deleted anything', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'errands' },
  ]);

  const handed: { kept: unknown } = { kept: null };

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: async (tx) => {
      const threads = await sql<{ thread: string }>`select thread from threads
        order by thread`.execute(tx);

      return threads.rows.map((row) => row.thread);
    },
    writeFirstRecords: (_tx, kept) => {
      handed.kept = kept;

      return Promise.resolve();
    },
  });

  expect(handed.kept).toStrictEqual(['conversation', 'errands']);
});

test('it empties every projection, so the thread of a first record starts at that record', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'errands' },
  ]);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: async (tx) => {
      await writeRecordsInTransaction(tx, ctx.log, [
        { kind: 'log_reset', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
      ]);
    },
  });

  const threads = await sql`select thread, first_sequence, last_sequence, record_count
    from threads`.execute(ctx.writer.db);

  const changes = await sql`select sequence, projection, row_key
    from projection_changes`.execute(ctx.writer.db);

  expect(threads.rows).toStrictEqual([
    { thread: 'conversation', first_sequence: 3, last_sequence: 3, record_count: 1 },
  ]);

  expect(changes.rows).toStrictEqual([
    { sequence: 3, projection: 'threads', row_key: 'conversation' },
  ]);
});

test('it removes every key of the old log from the key store', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'water the ferns' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'call the plumber' },
    },
  ]);

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  const keys = await sql`select key_id from record_keys`.execute(ctx.writer.keys);

  expect(keys.rows).toStrictEqual([]);
});

test('it keeps the rows of a kept table', async () => {
  const ctx = await setupTest();

  await sql`insert into personas (persona_version, instructions)
    values ('persona-1', 'be brief')`.execute(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: ['personas'],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  const personas = await sql`select persona_version from personas`.execute(ctx.writer.db);

  expect(personas.rows).toStrictEqual([{ persona_version: 'persona-1' }]);
});

test('it lets a kept row point at an old record until the first records point it at a new one', async () => {
  const ctx = await setupTest();

  const [enrolled] = await writeRecords(ctx.log, [
    { kind: 'session.enrolled', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await sql`insert into identities (identity_id, channel, external_id, label, paired_at,
      last_seen_at, paired_sequence)
    values ('kept-session', 'client', 'kept-session', 'tablet', 1, 1,
      ${enrolled?.sequence})`.execute(ctx.writer.db);

  await runLogReset(ctx.log, {
    keptTables: ['identities'],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: async (tx) => {
      const [kept] = await writeRecordsInTransaction(tx, ctx.log, [
        { kind: 'session_kept', definitions: { snapshotHash: 'sha256:aa11' } },
      ]);

      await sql`update identities set paired_sequence = ${kept?.sequence}`.execute(tx);
    },
  });

  const identities = await sql`select identity_id, paired_sequence
    from identities`.execute(ctx.writer.db);

  expect(identities.rows).toStrictEqual([{ identity_id: 'kept-session', paired_sequence: 2 }]);
});

test('it removes the copies taken before a migration', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie-schema-3.db'), 'an old copy');
  await writeFile(join(ctx.dataDir, 'nixie-schema-4.db.partial'), 'a copy cut short');

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  const names = await readdir(ctx.dataDir);

  expect(names.filter((name) => name.startsWith('nixie-schema-'))).toStrictEqual([]);
});

test('it never removes another file in the data directory', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie-schema-notes.txt'), 'not a copy');

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  const names = await readdir(ctx.dataDir);

  expect(names).toIncludeAllMembers(['nixie-schema-notes.txt', 'nixie.db', 'keys.db']);
});

test('it leaves no old payload in the database files and no old key ID in the key store files', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      payload: { errand: 'Marigold-errand-5KD' },
      erasable: { text: 'buy seeds' },
    },
  ]);

  const keys = await sql<{ key_id: string }>`select key_id from record_keys`.execute(
    ctx.writer.keys,
  );

  await runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  const names = await readdir(ctx.dataDir);
  const files = await Promise.all(names.map((name) => readFile(join(ctx.dataDir, name))));

  const texts = files.map((file) => file.toString('latin1'));

  expect(keys.rows).toBeArrayOfSize(1);
  expect(texts.filter((text) => text.includes('Marigold-errand-5KD'))).toStrictEqual([]);

  expect(texts.filter((text) => keys.rows.some((row) => text.includes(row.key_id)))).toStrictEqual(
    [],
  );
});

test('it leaves every record in place, shredded, when the wipe fails after the keys are gone', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'pick up the parcel' },
    },
  ]);

  const reset = runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.reject(new Error('the read failed')),
    writeFirstRecords: () => Promise.resolve(),
  });

  await Promise.allSettled([reset]);

  const read = await readRecords(ctx.log, { afterSequence: 0 });

  expect(reset).rejects.toThrowWithMessage(Error, 'the read failed');

  expect(read.map((entry) => [entry.record.sequence, entry.record.erasable])).toStrictEqual([
    [1, { status: 'shredded' }],
  ]);
});

test('it finishes a reset that a crash cut short after the keys were gone', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'pick up the parcel' },
    },
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' } },
  ]);

  await Promise.allSettled([
    runLogReset(ctx.log, {
      keptTables: [],
      readKept: () => Promise.reject(new Error('the process died')),
      writeFirstRecords: () => Promise.resolve(),
    }),
  ]);

  await ctx.writer.stop();

  const writer = await startWriter({ dataDir: ctx.dataDir });

  onTestFinished(() => writer.stop());

  const log = { ...ctx.log, writer };

  await runLogReset(log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: async (tx) => {
      await writeRecordsInTransaction(tx, log, [
        { kind: 'log_reset', definitions: { snapshotHash: 'sha256:aa11' } },
      ]);
    },
  });

  const read = await readRecords(log, { afterSequence: 0 });

  expect(read.map((entry) => [entry.record.sequence, entry.record.kind])).toStrictEqual([
    [3, 'log_reset'],
  ]);
});

test('it removes nothing when another process took the writer role', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      erasable: { text: 'feed the cat' },
    },
  ]);

  await sql`update writer_epoch set epoch = epoch + 1`.execute(ctx.writer.db);

  const reset = runLogReset(ctx.log, {
    keptTables: [],
    readKept: () => Promise.resolve(null),
    writeFirstRecords: () => Promise.resolve(),
  });

  await Promise.allSettled([reset]);

  const keys = await sql`select key_id from record_keys`.execute(ctx.writer.keys);
  const records = await sql`select sequence from records`.execute(ctx.writer.db);

  expect(reset).rejects.toMatchObject({ name: 'StaleWriterError' });
  expect(keys.rows).toBeArrayOfSize(1);
  expect(records.rows).toStrictEqual([{ sequence: 1 }]);
});
