import { expect, test } from 'bun:test';
import { isStepEnded } from './is-step-ended.ts';

test('it takes a committed step whose read cursor is at the sent message, with no reply', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 10, kind: 'owner_message' },
          { sequence: 11, kind: 'task.step_committed' },
        ],
        lastStepEnd: {
          sequence: 11,
          kind: 'task.step_committed',
          task: { readCursor: 10, stepKey: 'conversation:3' },
        },
      },
      10,
    ),
  ).toBeTrue();
});

test('it ignores a step that ended after the sent message but read only earlier records', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 8, kind: 'task.step_started' },
          { sequence: 10, kind: 'owner_message' },
          { sequence: 11, kind: 'model.reply' },
          { sequence: 12, kind: 'task.step_committed' },
        ],
        lastStepEnd: {
          sequence: 12,
          kind: 'task.step_committed',
          task: { readCursor: 7, stepKey: 'conversation:2' },
        },
      },
      10,
    ),
  ).toBeFalse();
});

test('it takes a failed step that started after the sent message', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 10, kind: 'owner_message' },
          { sequence: 11, kind: 'task.step_started', task: { stepKey: 'conversation:4' } },
          { sequence: 12, kind: 'task.step_errored' },
        ],
        lastStepEnd: { sequence: 12, kind: 'task.step_errored', task: { stepKey: 'conversation:4' } },
      },
      10,
    ),
  ).toBeTrue();
});

test('it ignores a failed step that started before the sent message', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 9, kind: 'task.step_started', task: { stepKey: 'conversation:4' } },
          { sequence: 10, kind: 'owner_message' },
          { sequence: 11, kind: 'task.step_errored' },
        ],
        lastStepEnd: { sequence: 11, kind: 'task.step_errored', task: { stepKey: 'conversation:4' } },
      },
      10,
    ),
  ).toBeFalse();
});

test('it reports a thread with no ended step as not ended', () => {
  expect(
    isStepEnded({ records: [{ sequence: 1, kind: 'task.created' }], lastStepEnd: null }, 0),
  ).toBeFalse();
});
