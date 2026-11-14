import { expect, test } from 'bun:test';
import { readQueryRows } from '@heynixie/db';
import { sql } from 'kysely';
import { z } from 'zod';
import { exemptTaskInTransaction } from './exempt-task-in-transaction';
import { pauseNixieInTransaction } from './pause-nixie-in-transaction';
import { readPause } from './read-pause';
import { startTestLog } from './test-utils/start-test-log';
import { withWriteTransaction } from './with-write-transaction';

async function setupTest() {
  const log = await startTestLog();

  return { ...log, definitions: { snapshotHash: 'sha256:aa11' } };
}

test('it records a pause on no thread, and reads it back', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    }),
  );

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));
  const records = await sql`select kind, thread, payload from records`.execute(ctx.writer.db);

  expect(pause).toStrictEqual({ cause: 'owner', recoveryID: null });

  expect(records.rows).toStrictEqual([
    {
      kind: 'nixie.paused',
      thread: null,
      payload: JSON.stringify({ cause: 'owner', recoveryID: null, by: 'session-a' }),
    },
  ]);
});

test('it leaves a restore pause in place when the spending stop pauses', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    });

    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'spending',
      recoveryID: null,
      by: null,
      definitions: ctx.definitions,
    });
  });

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));
  const records = await sql`select kind from records`.execute(ctx.writer.db);

  expect(pause).toStrictEqual({ cause: 'restore', recoveryID: 'recovery-a' });
  expect(records.rows).toStrictEqual([{ kind: 'nixie.paused' }]);
});

test('it leaves an owner pause in place when the spending stop pauses', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, async (tx) => {
    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    });

    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'spending',
      recoveryID: null,
      by: null,
      definitions: ctx.definitions,
    });
  });

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));

  expect(pause).toStrictEqual({ cause: 'owner', recoveryID: null });
});

test('it replaces the cause and empties the exemptions when another pause follows', async () => {
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

    await pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: 'recovery-a',
      by: null,
      definitions: ctx.definitions,
    });
  });

  const pause = await withWriteTransaction(ctx.writer, (tx) => readPause(tx));
  const exemptions = await sql`select task_id from pause_exemptions`.execute(ctx.writer.db);

  expect(pause).toStrictEqual({ cause: 'restore', recoveryID: 'recovery-a' });
  expect(exemptions.rows).toStrictEqual([]);
});

test('it closes the reader gate with the pause', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: null,
      by: 'session-a',
      definitions: ctx.definitions,
    }),
  );

  const gate = await readQueryRows(
    sql`select oldest_reader, open_oldest_reader from schema_version`,
    ctx.writer.db,
    z.object({ oldest_reader: z.number(), open_oldest_reader: z.number().nullable() }),
  );

  expect(gate).toStrictEqual([{ oldest_reader: 45, open_oldest_reader: 35 }]);
});

test('it refuses a restore pause with no recovery ID', async () => {
  const ctx = await setupTest();

  const pause = withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'restore',
      recoveryID: null,
      by: null,
      definitions: ctx.definitions,
    }),
  );

  await Promise.allSettled([pause]);

  expect(pause).rejects.toThrowWithMessage(Error, 'a restore pause needs a recovery ID');
});

test('it refuses an owner pause with a recovery ID', async () => {
  const ctx = await setupTest();

  const pause = withWriteTransaction(ctx.writer, (tx) =>
    pauseNixieInTransaction(tx, ctx.log, {
      cause: 'owner',
      recoveryID: 'recovery-a',
      by: 'session-a',
      definitions: ctx.definitions,
    }),
  );

  await Promise.allSettled([pause]);

  expect(pause).rejects.toThrowWithMessage(Error, 'only a restore pause takes a recovery ID');
});
