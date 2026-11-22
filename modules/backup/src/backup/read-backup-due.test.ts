import { expect, test } from 'bun:test';
import type { ErasableRecordKind, JSONObject, RecordKind } from '@heynixie/log';
import { localDataStorage, withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { buildSeeder } from '../test-utils/build-seeder';
import { readBackupDue } from './read-backup-due';

async function setupTest() {
  const log = await startTestLog();

  const deps = { log: log.log, context: { writer: log.writer, storage: localDataStorage } };

  return { ...log, seed: buildSeeder(deps) };
}

test('it reads no set and no forget in a new log', async () => {
  const ctx = await setupTest();
  const due = await readBackupDue(ctx.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});

test('it reads a forget as due once its record is newer than every set copy', async () => {
  const ctx = await setupTest();
  const forgotten = await ctx.seed.record({ kind: 'memory.forgotten', payload: {} });

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'scheduled', 'published', ${forgotten.sequence - 1}, 1798761500000)`.execute(tx);
  });

  const due = await readBackupDue(ctx.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: 1_798_761_500_000,
  });
});

test.each<[string, boolean, Exclude<RecordKind, ErasableRecordKind>, JSONObject]>([
  ['a message forget', true, 'record.forgotten', { sequence: 4, thread: 'thread-a' }],
  ['a note forget', true, 'notebook.note_forgotten', { note: 'note-a', shortID: 'n4w8k2c6rd' }],
  [
    'a finished moment destroy',
    true,
    'moment_destroyed',
    { momentID: 'moment-a', version: 2, stage: 'done' },
  ],
  [
    'a reset of the conversations',
    true,
    'log_reset',
    { resetAt: 1_798_761_600_000, lastSequence: 8, mode: 'conversations', shreddedRecords: 3 },
  ],
  [
    'a full reset',
    false,
    'log_reset',
    { resetAt: 1_798_761_600_000, lastSequence: 8, mode: 'full', keptSessions: 1 },
  ],
  [
    'a started moment destroy',
    false,
    'moment_destroyed',
    { momentID: 'moment-a', version: 2, stage: 'started' },
  ],
])(
  'it reads whether a forget is due after %s as %p',
  async (_label, isForgetDue, kind, payload) => {
    const ctx = await setupTest();

    await ctx.seed.record({ kind, payload });

    const due = await readBackupDue(ctx.writer);

    expect(due.isForgetDue).toBe(isForgetDue);
  },
);

test('it reads a forget as covered by a set whose copy started after it', async () => {
  const ctx = await setupTest();
  const forgotten = await ctx.seed.record({ kind: 'memory.forgotten', payload: {} });

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'staged', ${forgotten.sequence}, 1_798_761_600_000)`.execute(tx);
  });

  const due = await readBackupDue(ctx.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: true,
    newestStagedAt: 1_798_761_600_000,
  });
});

test('it leaves an abandoned set out, so its forget stays due', async () => {
  const ctx = await setupTest();
  const forgotten = await ctx.seed.record({ kind: 'memory.forgotten', payload: {} });

  await withWriteTransaction(ctx.writer, async (tx) => {
    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'abandoned', ${forgotten.sequence}, 1_798_761_600_000)`.execute(tx);
  });

  const due = await readBackupDue(ctx.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});
