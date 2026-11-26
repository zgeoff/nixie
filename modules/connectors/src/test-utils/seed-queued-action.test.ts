import { expect, test } from 'bun:test';
import { readQueuedSeconds } from '../google/read-queued-seconds';
import { seedQueuedAction } from './seed-queued-action';
import { startTestLog } from './start-test-log';

test('it puts the action in the queue at the time given', async () => {
  const log = await startTestLog();

  await seedQueuedAction(log, { actionID: 'action-1', queuedAtMs: 1_700_000_123_000 });

  const seconds = await readQueuedSeconds(log, 'action-1');

  expect(seconds).toBe(1_700_000_123);
});

test('it applies the time of each call to its own action', async () => {
  const log = await startTestLog();

  await seedQueuedAction(log, { actionID: 'action-1', queuedAtMs: 1_700_000_000_000 });

  const other = await readQueuedSeconds(log, 'action-2');

  expect(other).toBeNull();
});
