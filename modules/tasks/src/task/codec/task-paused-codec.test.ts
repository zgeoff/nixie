import { expect, test } from 'bun:test';
import { taskPausedCodec } from './task-paused-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskPausedCodec.encode({ taskID: 'k3x9m2p7qa', resumeState: 'waiting' });

  expect(taskPausedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    resumeState: 'waiting',
  });
});

test('it refuses a resume state a task cannot rest in', () => {
  expect(() => taskPausedCodec.decode({ taskID: 'k3x9m2p7qa', resumeState: 'running' })).toThrow(
    /"path": \[\s+"resumeState"\s+\]/u,
  );
});
