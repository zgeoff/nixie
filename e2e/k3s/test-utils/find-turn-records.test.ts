import { expect, test } from 'bun:test';
import { findTurnRecords } from './find-turn-records';

test('it finds the records from the message to the first step commit after it', () => {
  expect(
    findTurnRecords(
      [
        {
          kind: 'task.step_committed',
          recordedAt: new Date(0),
          sequence: 4,
          thread: 'conversation',
        },
        { kind: 'model.reply', recordedAt: new Date(0), sequence: 8, thread: 'conversation' },
        { kind: 'owner_message', recordedAt: new Date(0), sequence: 6, thread: 'conversation' },
        { kind: 'task.step_started', recordedAt: new Date(0), sequence: 7, thread: 'conversation' },
        {
          kind: 'task.step_committed',
          recordedAt: new Date(0),
          sequence: 9,
          thread: 'conversation',
        },
        {
          kind: 'task.step_started',
          recordedAt: new Date(0),
          sequence: 10,
          thread: 'conversation',
        },
      ],
      6,
    ),
  ).toStrictEqual([
    { kind: 'owner_message', recordedAt: new Date(0), sequence: 6, thread: 'conversation' },
    { kind: 'task.step_started', recordedAt: new Date(0), sequence: 7, thread: 'conversation' },
    { kind: 'model.reply', recordedAt: new Date(0), sequence: 8, thread: 'conversation' },
    { kind: 'task.step_committed', recordedAt: new Date(0), sequence: 9, thread: 'conversation' },
  ]);
});

test('it answers null while the step after the message has not committed', () => {
  expect(
    findTurnRecords(
      [
        {
          kind: 'task.step_committed',
          recordedAt: new Date(0),
          sequence: 4,
          thread: 'conversation',
        },
        { kind: 'owner_message', recordedAt: new Date(0), sequence: 6, thread: 'conversation' },
        { kind: 'task.step_started', recordedAt: new Date(0), sequence: 7, thread: 'conversation' },
      ],
      6,
    ),
  ).toBeNull();
});
