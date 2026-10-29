import { expect, test } from 'bun:test';
import { taskRestartedCodec } from './task-restarted-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskRestartedCodec.encode({ taskID: 'k3x9m2p7qa', nextState: 'ready' });

  expect(taskRestartedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    nextState: 'ready',
  });
});

test('it refuses a restart to a state a restart never reaches', () => {
  expect(() => taskRestartedCodec.decode({ taskID: 'k3x9m2p7qa', nextState: 'running' })).toThrow(
    /"path": \[\s+"nextState"\s+\]/u,
  );
});
