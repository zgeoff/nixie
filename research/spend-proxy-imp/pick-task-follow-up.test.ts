import { expect, test } from 'bun:test';
import { pickTaskFollowUp } from './pick-task-follow-up.ts';

test('it waits for the one task that was not known before the turn', () => {
  expect(
    pickTaskFollowUp(['task-harbour'], [{ taskID: 'task-harbour' }, { taskID: 'task-tide' }]),
  ).toStrictEqual({ kind: 'wait-for-task', taskID: 'task-tide' });
});

test('it reports no task when the turn started none', () => {
  expect(pickTaskFollowUp(['task-harbour'], [{ taskID: 'task-harbour' }])).toStrictEqual({
    kind: 'no-task',
  });
});
