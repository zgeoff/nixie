import { expect, test } from 'bun:test';
import { taskResumedCodec } from './task-resumed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskResumedCodec.encode({ taskID: 'k3x9m2p7qa', nextState: 'running' });

  expect(taskResumedCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    nextState: 'running',
  });
});

test('it refuses a resume to a state a resume never reaches', () => {
  expect(() => taskResumedCodec.decode({ taskID: 'k3x9m2p7qa', nextState: 'done' })).toThrow(
    /"path": \[\s+"nextState"\s+\]/u,
  );
});
