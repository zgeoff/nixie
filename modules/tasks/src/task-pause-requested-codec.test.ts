import { expect, test } from 'bun:test';
import { taskPauseRequestedCodec } from './task-pause-requested-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskPauseRequestedCodec.encode({ taskID: 'k3x9m2p7qa', stepKey: 'k3x9m2p7qa:2' });

  expect(taskPauseRequestedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    stepKey: 'k3x9m2p7qa:2',
  });
});

test('it refuses a payload that names no step', () => {
  expect(() => taskPauseRequestedCodec.decode({ taskID: 'k3x9m2p7qa' })).toThrow(
    /"path": \[\s+"stepKey"\s+\]/u,
  );
});
