import { expect, test } from 'bun:test';
import { taskMessageRefusedCodec } from './task-message-refused-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = taskMessageRefusedCodec.encode({
    from: 'k3x9m2p7qa',
    to: 'w8n4c1d6rb',
    kind: 'progress',
    stepKey: 'k3x9m2p7qa:4',
    refusal: { reason: 'finished', taskID: 'w8n4c1d6rb' },
  });

  expect(taskMessageRefusedCodec.decode(payload)).toStrictEqual({
    from: 'k3x9m2p7qa',
    to: 'w8n4c1d6rb',
    kind: 'progress',
    stepKey: 'k3x9m2p7qa:4',
    refusal: { reason: 'finished', taskID: 'w8n4c1d6rb' },
  });
});

test('it refuses a refusal of no known reason', () => {
  expect(() =>
    taskMessageRefusedCodec.decode({
      from: 'k3x9m2p7qa',
      to: 'w8n4c1d6rb',
      kind: 'progress',
      stepKey: 'k3x9m2p7qa:4',
      refusal: { reason: 'too_loud' },
    }),
  ).toThrow(/"reason"/u);
});
