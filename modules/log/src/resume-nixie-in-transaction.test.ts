import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { exemptTaskInTransaction } from './exempt-task-in-transaction';
import { pauseNixieInTransaction } from './pause-nixie-in-transaction';
import { readPause } from './read-pause';
import { resumeNixieInTransaction } from './resume-nixie-in-transaction';
import { startTestLog } from './test-utils/start-test-log';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, definitions: { snapshotHash: 'sha256:aa11' } };
}

test('it writes nothing when nixie is not paused', async () => {
  const ctx = await setupTest();

  const result = await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.log, { by: 'session-a', definitions: ctx.definitions }),
  );

  const records = await sql`select kind from records`.execute(ctx.writer.db);

  expect(result).toStrictEqual({ wasPaused: false });
  expect(records.rows).toStrictEqual([]);
});

test('it ends the pause and every exemption, and reopens the reader gate', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    });

    await exemptTaskInTransaction(tx, ctx.log, {
      taskID: 'task-a',
      by: 'session-a',
      definitions: ctx.definitions,
    });
  });

  const result = await withWriteTransaction(ctx.writer, (tx) =>
    resumeNixieInTransaction(tx, ctx.log, { by: 'session-a', definitions: ctx.definitions }),
  );

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));
  const exemptions = await sql`select task_id from pause_exemptions`.execute(ctx.writer.db);

  const gate = await readQueryRows(
    sql`select oldest_reader, open_oldest_reader from schema_version`,
    ctx.writer.db,
    z.object({ oldest_reader: z.number(), open_oldest_reader: z.number().nullable() }),
  );

  const records = await sql`select kind, thread from records order by sequence`.execute(
    ctx.writer.db,
  );

  expect(result).toStrictEqual({ wasPaused: true });
  expect(pause).toBeNull();
  expect(exemptions.rows).toStrictEqual([]);
  expect(gate).toStrictEqual([{ oldest_reader: 35, open_oldest_reader: null }]);

  expect(records.rows).toStrictEqual([
    { kind: 'nixie.paused', thread: null },
    { kind: 'nixie.task_exempted', thread: null },
    { kind: 'nixie.resumed', thread: null },
  ]);
});
