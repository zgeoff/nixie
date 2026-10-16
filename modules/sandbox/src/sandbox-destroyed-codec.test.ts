import { expect, test } from 'bun:test';
import { sandboxDestroyedCodec } from './sandbox-destroyed-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = sandboxDestroyedCodec.encode({ sandboxID: 'sandbox-1', reason: 'create_failed' });

  expect(sandboxDestroyedCodec.decode(payload)).toStrictEqual({
    sandboxID: 'sandbox-1',
    reason: 'create_failed',
  });
});

test('it refuses a reason outside the known ends', () => {
  expect(() => sandboxDestroyedCodec.decode({ sandboxID: 'sandbox-1', reason: 'slept' })).toThrow(
    /"reason"/u,
  );
});
