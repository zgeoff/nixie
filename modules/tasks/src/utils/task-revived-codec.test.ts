import { expect, test } from 'bun:test';
import { taskRevivedCodec } from './task-revived-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskRevivedCodec.encode({ taskID: 'conversation' });

  expect(taskRevivedCodec.decode(payload)).toStrictEqual({ taskID: 'conversation' });
});

test('it refuses a payload that names no task', () => {
  expect(() => taskRevivedCodec.decode({})).toThrow(/"path": \[\s+"taskID"\s+\]/u);
});
