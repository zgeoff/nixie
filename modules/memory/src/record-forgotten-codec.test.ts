import { expect, test } from 'bun:test';
import { recordForgottenCodec } from './record-forgotten-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = recordForgottenCodec.encode({ recordSequence: 12 });

  expect(recordForgottenCodec.decode(payload)).toStrictEqual({ recordSequence: 12 });
});

test('it refuses a payload that names no record', () => {
  expect(() => recordForgottenCodec.decode({})).toThrow(/"recordSequence"/u);
});
