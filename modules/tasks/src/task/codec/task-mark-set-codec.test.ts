import { expect, test } from 'bun:test';
import { taskMarkSetCodec } from './task-mark-set-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskMarkSetCodec.encode({ taskID: 'k3x9m2p7qa', disposable: false });

  expect(taskMarkSetCodec.decode(payload)).toStrictEqual({
    taskID: 'k3x9m2p7qa',
    disposable: false,
  });
});

test('it refuses a mark that is not a boolean', () => {
  expect(() => taskMarkSetCodec.decode({ taskID: 'k3x9m2p7qa', disposable: 'yes' })).toThrow(
    /"path": \[\s+"disposable"\s+\]/u,
  );
});
