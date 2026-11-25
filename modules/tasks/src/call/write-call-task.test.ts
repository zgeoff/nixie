import { expect, test } from 'bun:test';
import { withWriteTransaction } from '@heynixie/log';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readCallTask } from './read-call-task';
import { writeCallTask } from './write-call-task';

test('it creates a task that its reader finds with the call it holds', async () => {
  const ctx = await startTestTasks();

  const taskID = await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeCallTask(tx, ctx.context, { callID: 'c7q2', seedThrough: 9 }),
  );

  const task = await readCallTask(ctx.context, taskID);

  expect(task).toStrictEqual({ callID: 'c7q2', seedThrough: 9 });
});

test('it reads no call from a task that is no call task', async () => {
  const ctx = await startTestTasks();
  const task = await readCallTask(ctx.context, 'conversation');

  expect(task).toBeNull();
});
