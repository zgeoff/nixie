import { expect, test } from 'bun:test';
import { timerFiredCodec } from './timer-fired-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = timerFiredCodec.encode({
    timerID: 'timer-1',
    taskID: 'task-1',
    dueAt: 2_000_000,
    firedAt: 2_000_500,
  });

  expect(timerFiredCodec.decode(payload)).toStrictEqual({
    timerID: 'timer-1',
    taskID: 'task-1',
    dueAt: 2_000_000,
    firedAt: 2_000_500,
  });
});

test('it refuses a fire time that is not a number', () => {
  expect(() =>
    timerFiredCodec.decode({
      timerID: 'timer-1',
      taskID: 'task-1',
      dueAt: 2_000_000,
      firedAt: '2_000_500',
    }),
  ).toThrow(/"path": \[\s+"firedAt"\s+\]/u);
});
