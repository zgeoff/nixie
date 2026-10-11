import { expect, test } from 'bun:test';
import { findTurnRecords } from './find-turn-records';

test('it finds the message and the first step that starts after it, through its commit', () => {
  expect(
    findTurnRecords(
      [
        { kind: 'task.step_committed', sequence: 4 },
        { kind: 'model.reply', sequence: 8 },
        { kind: 'owner_message', sequence: 6 },
        { kind: 'task.step_started', sequence: 7 },
        { kind: 'task.step_committed', sequence: 9 },
        { kind: 'task.step_started', sequence: 10 },
      ],
      6,
    ),
  ).toStrictEqual([
    { kind: 'owner_message', sequence: 6 },
    { kind: 'task.step_started', sequence: 7 },
    { kind: 'model.reply', sequence: 8 },
    { kind: 'task.step_committed', sequence: 9 },
  ]);
});

test('it skips a step that was in flight when the message arrived', () => {
  expect(
    findTurnRecords(
      [
        { kind: 'task.step_started', sequence: 5 },
        { kind: 'owner_message', sequence: 6 },
        { kind: 'model.reply', sequence: 7 },
        { kind: 'task.step_committed', sequence: 8 },
        { kind: 'task.step_started', sequence: 9 },
        { kind: 'tool_called', sequence: 10 },
        { kind: 'task.step_committed', sequence: 11 },
      ],
      6,
    ),
  ).toStrictEqual([
    { kind: 'owner_message', sequence: 6 },
    { kind: 'task.step_started', sequence: 9 },
    { kind: 'tool_called', sequence: 10 },
    { kind: 'task.step_committed', sequence: 11 },
  ]);
});

test('it answers null while the step after the message has not committed', () => {
  expect(
    findTurnRecords(
      [
        { kind: 'task.step_started', sequence: 5 },
        { kind: 'owner_message', sequence: 6 },
        { kind: 'task.step_committed', sequence: 7 },
        { kind: 'task.step_started', sequence: 8 },
      ],
      6,
    ),
  ).toBeNull();
});

test('it answers null when the page lacks the message', () => {
  expect(
    findTurnRecords(
      [
        { kind: 'task.step_started', sequence: 7 },
        { kind: 'task.step_committed', sequence: 8 },
      ],
      6,
    ),
  ).toBeNull();
});
