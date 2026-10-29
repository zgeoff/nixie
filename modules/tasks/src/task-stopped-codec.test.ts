import { expect, test } from 'bun:test';
import { taskStoppedCodec } from './task-stopped-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskStoppedCodec.encode({
    taskID: 'k3x9m2p7qa',
    stepKey: null,
    timerIDs: ['7c1e9a40-3d2b-4f6e-8a15-b9c0d4e2f731'],
    resumeState: 'waiting',
  });

  expect(taskStoppedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    stepKey: null,
    timerIDs: ['7c1e9a40-3d2b-4f6e-8a15-b9c0d4e2f731'],
    resumeState: 'waiting',
  });
});

test('it refuses a payload that lists no timers', () => {
  expect(() =>
    taskStoppedCodec.decode({ taskID: 'k3x9m2p7qa', stepKey: null, resumeState: 'ready' }),
  ).toThrow(/"path": \[\s+"timerIDs"\s+\]/u);
});
