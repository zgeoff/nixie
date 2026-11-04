import { expect, test } from 'bun:test';
import { store } from './store';
import { writeMockRetry } from './write-mock-retry';

test('it adds a revival of the conversation after a failed step', async () => {
  await store.records.create({
    kind: 'task.step_errored',
    task: { taskID: 'conversation', errors: 1, isWaitingForRetry: true, reason: 'model_api.quota' },
  });

  const result = await writeMockRetry({ clientActionID: '7d3c9a52-1f4e-4b8a-9c61-2e5f8a0b4d17' });

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

  const result = await writeMockRetry({ clientActionID: '7d3c9a52-1f4e-4b8a-9c61-2e5f8a0b4d17' });

  expect(result).toStrictEqual({ status: 'nothing_to_retry' });
});

test('it returns the first result again for a repeated retry', async () => {
  await store.records.create({
    kind: 'task.step_errored',
    task: { taskID: 'conversation', errors: 1, isWaitingForRetry: true, reason: 'model_api.quota' },
  });

  const first = await writeMockRetry({ clientActionID: '3b8e1f60-9a2d-4c75-8e14-6f0d2a9c5b38' });

  const repeated = await writeMockRetry({
    clientActionID: '3b8e1f60-9a2d-4c75-8e14-6f0d2a9c5b38',
  });

  expect(repeated).toStrictEqual(first);
});

test('it refuses a conversation whose next step started after the failed one', async () => {
  await store.records.create({
    kind: 'task.step_errored',
    task: { taskID: 'conversation', errors: 1 },
  });

  await store.records.create({
    kind: 'task.step_started',
    task: { taskID: 'conversation' },
  });

  const result = await writeMockRetry({ clientActionID: '5c2e8b14-7a3f-4d96-b0e1-9f4a6c3d2e85' });

  expect(result).toStrictEqual({ status: 'nothing_to_retry' });
});
