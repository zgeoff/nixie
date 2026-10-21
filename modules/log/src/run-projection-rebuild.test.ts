import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { removeRecordKey } from './remove-record-key';
import { runProjectionRebuild } from './run-projection-rebuild';
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

  // every projection row and every change row as one value, so the 2 reads compare whole
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
