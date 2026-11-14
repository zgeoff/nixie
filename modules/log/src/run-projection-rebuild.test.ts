import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { nixiePausedCodec } from './nixie-paused-codec';
import { recoveryStartedCodec } from './recovery-started-codec';
import { removeRecordKey } from './remove-record-key';
import { runProjectionRebuild } from './run-projection-rebuild';
import { taskExemptedCodec } from './task-exempted-codec';
import { startTestLog } from './test-utils/start-test-log';
import { writeRecords } from './write-records';

function setupTest() {
  return startTestLog();
}

test('it folds a recorded log into the live tables once every projection is dropped', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11', personaVersion: 'p1' },
      thread: 'conversation',
      erasable: { text: 'what is on today' },
    },
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:aa11', personaVersion: 'p1' },
      thread: 'conversation',
      parent: 1,
      decision: { outcome: 'allow', stage: 7, rule: { id: 'slice1.read-only', revision: 1 } },
    },
    { kind: 'definitions_seeded', definitions: { snapshotHash: 'sha256:dd44' } },
    { kind: 'task_created', definitions: { snapshotHash: 'sha256:dd44' }, thread: 'task-backlog' },
  ]);

  await writeRecords(ctx.log, [
    { kind: 'turn_finished', definitions: { snapshotHash: 'sha256:dd44' }, thread: 'conversation' },
  ]);

  const readTables = sql`select
    (select json_group_array(json_array(thread, first_sequence, last_sequence, record_count,
      last_recorded_at)) from (select * from threads order by thread)) as threads,
    (select json_group_array(json_array(sequence, projection, row_key, row))
      from (select * from projection_changes order by sequence, row_key)) as changes`;

  const live = await readTables.execute(ctx.writer.db);

  await sql`delete from projection_changes; delete from threads`.execute(ctx.writer.db);

  await runProjectionRebuild(ctx.log);

  const folded = await readTables.execute(ctx.writer.db);

  expect(live.rows).toStrictEqual([
    { threads: expect.toStartWith('[["conversation",1,5,3,'), changes: expect.any(String) },
  ]);

  expect(folded.rows).toStrictEqual(live.rows);
});

test('it folds the same rows after a record key is gone', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:aa11' },
      thread: 'conversation',
      erasable: { text: 'forget that I said this' },
    },
  ]);

  const [key] = await readQueryRows(
    sql`select key_id from record_keys`,
    ctx.writer.keys,
    z.object({ key_id: z.string() }),
  );

  invariant(key);

  await removeRecordKey(ctx.log, key.key_id);

  const live = await sql`select * from threads`.execute(ctx.writer.db);

  await runProjectionRebuild(ctx.log);

  const folded = await sql`select * from threads`.execute(ctx.writer.db);

  expect(folded.rows).toStrictEqual(live.rows);
});

test('it refuses to rebuild under a stale writer epoch and leaves the projections as they were', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    { kind: 'owner_message', definitions: { snapshotHash: 'sha256:aa11' }, thread: 'conversation' },
  ]);

  await sql`update writer_epoch set epoch = epoch + 1`.execute(ctx.writer.db);

  const rebuild = runProjectionRebuild(ctx.log);

  await rebuild.catch(() => {});

  const threads = await sql`select thread from threads`.execute(ctx.writer.db);

  expect(rebuild).rejects.toMatchObject({ name: 'StaleWriterError' });
  expect(threads.rows).toStrictEqual([{ thread: 'conversation' }]);
});

test('it folds the pause, the exemptions and the recoveries back to the same rows', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:aa11' };

  await writeRecords(ctx.log, [
    {
      kind: 'nixie.paused',
      definitions,
      payload: nixiePausedCodec.encode({ cause: 'owner', recoveryID: null, by: 'session-a' }),
    },
    {
      kind: 'nixie.task_exempted',
      definitions,
      payload: taskExemptedCodec.encode({ taskID: 'task-a', by: 'session-a' }),
    },
    {
      kind: 'nixie.task_exempted',
      definitions,
      payload: taskExemptedCodec.encode({ taskID: 'task-b', by: 'session-a' }),
    },
    {
      kind: 'recovery.started',
      definitions,
      payload: recoveryStartedCodec.encode({
        recoveryID: 'recovery-a',
        restoredAt: 5,
        backupTakenAt: 4,
        toCheck: [
          { taskID: 'task-a', stateAtBackup: 'running', wasRunning: true, pendingActions: 1 },
        ],
      }),
    },
  ]);

  const readTables = sql`select
    (select json_group_array(json_array(id, cause, recovery_id, paused_sequence))
      from nixie_pause) as pause,
    (select json_group_array(json_array(task_id, exempt_sequence))
      from (select * from pause_exemptions order by task_id)) as exemptions,
    (select json_group_array(json_array(recovery_id, restored_at, backup_taken_at, started_sequence))
      from recoveries) as recoveries,
    (select json_group_array(json_array(sequence, projection, row_key, row))
      from (select * from projection_changes order by sequence, projection, row_key)) as changes`;

  const live = await readTables.execute(ctx.writer.db);

  await sql`delete from projection_changes; delete from recoveries;
    delete from pause_exemptions; delete from nixie_pause`.execute(ctx.writer.db);

  await runProjectionRebuild(ctx.log);

  const folded = await readTables.execute(ctx.writer.db);

  expect(live.rows).toStrictEqual([
    {
      pause: '[[1,"owner",null,1]]',
      exemptions: '[["task-a",2],["task-b",3]]',
      recoveries: '[["recovery-a",5,4,4]]',
      changes: expect.any(String),
    },
  ]);

  expect(folded.rows).toStrictEqual(live.rows);
});
