import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockRetry } from './write-mock-retry';

test('it adds a revival of the conversation after a failed step', async () => {
  await store.records.create({
    kind: 'task.step_errored',
    task: { taskID: 'conversation', errors: 1, isWaitingForRetry: true, reason: 'model_api.quota' },
  });

  const result = await writeMockRetry();

  const revived = store.records.findFirst((query) => query.where({ kind: 'task.revived' }));

  expect(result).toStrictEqual({ status: 'retried', retriedAt: expect.toBeValidDate() });
  expect(revived?.task).toStrictEqual({ taskID: 'conversation' });
});

test('it refuses a conversation whose last step committed', async () => {
  await store.records.create({
    kind: 'task.step_errored',
    task: { taskID: 'conversation', errors: 1 },
  });

  await store.records.create({
    kind: 'task.step_committed',
    task: { taskID: 'conversation' },
  });

  const result = await writeMockRetry();

  expect(result).toStrictEqual({ status: 'nothing_to_retry' });
});
