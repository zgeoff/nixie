import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import { sql } from 'kysely';
import { readBackupDue } from './read-backup-due';

test('it reads no set and no forget in a new log', async () => {
  const log = await startTestLog();
  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});

test('it reads a forget as due once its record is newer than every set copy', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'scheduled', 'published', 8, 1798761500000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: 1_798_761_500_000,
  });
});

test.each([
  ['a message forget', true, 'record.forgotten', '{"sequence":4,"thread":"thread-a"}'],
  [
    'a finished moment destroy',
    true,
    'moment_destroyed',
    '{"momentID":"moment-a","version":2,"stage":"done"}',
  ],
  [
    'a reset of the conversations',
    true,
    'log_reset',
    '{"resetAt":1798761600000,"lastSequence":8,"mode":"conversations","shreddedRecords":3}',
  ],
  [
    'a full reset',
    false,
    'log_reset',
    '{"resetAt":1798761600000,"lastSequence":8,"mode":"full","keptSessions":1}',
  ],
  [
    'a started moment destroy',
    false,
    'moment_destroyed',
    '{"momentID":"moment-a","version":2,"stage":"started"}',
  ],
])(
  'it reads whether a forget is due after %s as %p',
  async (_label, isForgetDue, kind, payload) => {
    const log = await startTestLog();

    await withWriteTransaction(log.writer, async (tx) => {
      await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, ${kind}, 'snapshot-a', ${payload})`.execute(tx);
    });

    const due = await readBackupDue(log.writer);

    expect(due.isForgetDue).toBe(isForgetDue);
  },
);

test('it reads a forget as covered by a set whose copy started after it', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'staged', 9, 1798761600000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: false,
    isSetWaiting: true,
    newestStagedAt: 1_798_761_600_000,
  });
});

test('it leaves an abandoned set out, so its forget stays due', async () => {
  const log = await startTestLog();

  await withWriteTransaction(log.writer, async (tx) => {
    await sql`insert into records (sequence, recorded_at, kind, snapshot_hash, payload)
      values (9, 1798761600000, 'memory.forgotten', 'snapshot-a', '{}')`.execute(tx);

    await sql`insert into backup_sets (sequence, kind, state, log_head, staged_at)
      values (1, 'forget', 'abandoned', 9, 1798761600000)`.execute(tx);
  });

  const due = await readBackupDue(log.writer);

  expect(due).toStrictEqual({
    isForgetDue: true,
    isSetWaiting: false,
    newestStagedAt: null,
  });
});
