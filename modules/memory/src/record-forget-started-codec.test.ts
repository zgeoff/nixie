import { expect, test } from 'bun:test';
import { recordForgetStartedCodec } from './record-forget-started-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = recordForgetStartedCodec.encode({ recordSequence: 12 });

  expect(recordForgetStartedCodec.decode(payload)).toStrictEqual({ recordSequence: 12 });
});

test('it refuses a sequence that is not a whole number', () => {
  expect(() => recordForgetStartedCodec.decode({ recordSequence: 1.5 })).toThrow(
    /"recordSequence"/u,
  );
});
