import { expect, test } from 'bun:test';
import { seedQueuedAction } from '../test-utils/seed-queued-action';
import { startTestLog } from '../test-utils/start-test-log';
import { readQueuedSeconds } from './read-queued-seconds';

test('it reads the time the queue recorded the action, in epoch seconds', async () => {
  const log = await startTestLog();

  await seedQueuedAction(log, { actionID: 'action-1', queuedAtMs: 1_794_550_000_999 });

  const seconds = await readQueuedSeconds(log, 'action-1');

  expect(seconds).toBe(1_794_550_000);
});

test('it answers null for an action the queue does not hold', async () => {
  const log = await startTestLog();
  const seconds = await readQueuedSeconds(log, 'action-2');

  expect(seconds).toBeNull();
});
