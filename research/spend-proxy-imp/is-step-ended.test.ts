import { expect, test } from 'bun:test';
import { isStepEnded } from './is-step-ended.ts';

test('it takes a step that replied after the sent message and then committed', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 10, kind: 'conversation.message' },
          { sequence: 11, kind: 'model.reply' },
          { sequence: 12, kind: 'task.step_committed' },
        ],
        lastStepEnd: { sequence: 12, kind: 'task.step_committed' },
      },
      10,
    ),
  ).toBeTrue();
});

test('it takes a step that ended in an error after the sent message', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 10, kind: 'conversation.message' },
          { sequence: 11, kind: 'task.step_errored' },
        ],
        lastStepEnd: { sequence: 11, kind: 'task.step_errored' },
      },
      10,
    ),
  ).toBeTrue();
});

test('it ignores a step that ended before the sent message', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 8, kind: 'model.reply' },
          { sequence: 9, kind: 'task.step_committed' },
        ],
        lastStepEnd: { sequence: 9, kind: 'task.step_committed' },
      },
      10,
    ),
  ).toBeFalse();
});

test('it ignores a step that committed after the sent message with no reply after it', () => {
  expect(
    isStepEnded(
      {
        records: [
          { sequence: 9, kind: 'model.reply' },
          { sequence: 10, kind: 'conversation.message' },
          { sequence: 11, kind: 'task.step_committed' },
        ],
        lastStepEnd: { sequence: 11, kind: 'task.step_committed' },
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
