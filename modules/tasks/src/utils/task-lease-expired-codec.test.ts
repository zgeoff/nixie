import { expect, test } from 'bun:test';
import { taskLeaseExpiredCodec } from './task-lease-expired-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskLeaseExpiredCodec.encode({ taskID: 'task-1' });

  expect(taskLeaseExpiredCodec.decode(payload)).toStrictEqual({ taskID: 'task-1' });
});

test('it refuses a task ID that is not a string', () => {
  expect(() => taskLeaseExpiredCodec.decode({ taskID: 7 })).toThrow(/"path": \[\s+"taskID"\s+\]/u);
});
