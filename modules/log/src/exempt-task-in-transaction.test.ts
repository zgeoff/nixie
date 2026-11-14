import { expect, test } from 'bun:test';
import { sql } from 'kysely';
import { exemptTaskInTransaction } from './exempt-task-in-transaction';
import { pauseNixieInTransaction } from './pause-nixie-in-transaction';
import { startTestLog } from './test-utils/start-test-log';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, definitions: { snapshotHash: 'sha256:aa11' } };
}

test('it throws when nixie is not paused', async () => {
  const ctx = await setupTest();

  const exempt = withWriteTransaction(ctx.writer, (tx) =>
    exemptTaskInTransaction(tx, ctx.log, {
      taskID: 'task-a',
      by: 'session-a',
      definitions: ctx.definitions,
    }),
  );

  await Promise.allSettled([exempt]);

  expect(exempt).rejects.toThrowWithMessage(Error, /nixie is not paused/u);
});

test('it exempts a task while nixie is paused', async () => {
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

  const exemptions = await sql`select task_id from pause_exemptions`.execute(ctx.writer.db);

  expect(exemptions.rows).toStrictEqual([{ task_id: 'task-a' }]);
});

test('it writes nothing for a task that is already exempt', async () => {
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

    await exemptTaskInTransaction(tx, ctx.log, {
      taskID: 'task-a',
      by: 'session-a',
      definitions: ctx.definitions,
    });
  });

  const records = await sql`select kind from records order by sequence`.execute(ctx.writer.db);

  expect(records.rows).toStrictEqual([{ kind: 'nixie.paused' }, { kind: 'nixie.task_exempted' }]);
});
