import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { readLimitRecords } from './read-limit-records';
import { startTestTasks } from './test-utils/start-test-tasks';
import {
  isLimitHoldMoveAllowed,
  writeTaskLimitHoldInTransaction,
} from './write-task-limit-hold-in-transaction';

function setupTest() {
  return startTestTasks();
}

test.each([
  ['free', 'reach', true],
  ['free', 'raise', false],
  ['held', 'raise', true],
  ['held', 'reach', false],
] as const)('it allows a %s hold to take a %s: %s', (hold, move, isAllowed) => {
  expect(isLimitHoldMoveAllowed(hold, move)).toBe(isAllowed);
});

test('it holds a task at the limits that it reached', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeTaskLimitHoldInTransaction(tx, ctx.context, 'tide-tables', {
      kind: 'reach',
      stepKey: 'tide-tables:3',
      used: { turns: 3, dollars: 0.4 },
      limits: { turns: 3, dollars: 1 },
    }),
  );

  const records = await readLimitRecords(ctx.context.log.writer.db, 'tide-tables');

  expect(records).toStrictEqual({ raised: null, heldAt: { turns: 3, dollars: 1 } });
});

test('it frees a held task under the raised limits', async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeTaskLimitHoldInTransaction(tx, ctx.context, 'tide-tables', {
      kind: 'reach',
      stepKey: 'tide-tables:3',
      used: { turns: 3, dollars: 0.4 },
      limits: { turns: 3, dollars: 1 },
    }),
  );

  await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeTaskLimitHoldInTransaction(tx, ctx.context, 'tide-tables', {
      kind: 'raise',
      limits: { turns: 8, dollars: 1 },
    }),
  );

  const records = await readLimitRecords(ctx.context.log.writer.db, 'tide-tables');

  expect(records).toStrictEqual({ raised: { turns: 8, dollars: 1 }, heldAt: null });
});
