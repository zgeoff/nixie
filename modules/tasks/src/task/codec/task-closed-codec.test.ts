import { expect, test } from 'bun:test';
import { taskClosedCodec } from './task-closed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskClosedCodec.encode({
    taskID: 'k3x9m2p7qa',
    stepKey: 'k3x9m2p7qa:3',
    timerIDs: [],
  });

  expect(taskClosedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    stepKey: 'k3x9m2p7qa:3',
    timerIDs: [],
  });
});

test('it refuses a payload that names no task', () => {
  expect(() => taskClosedCodec.decode({ stepKey: null, timerIDs: [] })).toThrow(
    /"path": \[\s+"taskID"\s+\]/u,
  );
});

test('it decodes who closed the task', () => {
  const payload = taskClosedCodec.encode({
    taskID: 'k3x9m2p7qa',
    stepKey: null,
    timerIDs: [],
    closedBy: 'nixie',
  });

  expect(taskClosedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    stepKey: null,
    timerIDs: [],
    closedBy: 'nixie',
  });
});

test('it refuses a closer that nixie does not know', () => {
  expect(() =>
    taskClosedCodec.decode({ taskID: 'k3x9m2p7qa', stepKey: null, timerIDs: [], closedBy: 'time' }),
  ).toThrow(/"path": \[\s+"closedBy"\s+\]/u);
});
