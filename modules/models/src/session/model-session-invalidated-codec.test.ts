import { expect, test } from 'bun:test';
import { modelSessionInvalidatedCodec } from './model-session-invalidated-codec';

test('it decodes the payload a writer encodes for a forgotten item', () => {
  const payload = modelSessionInvalidatedCodec.encode({ itemID: 'item-1' });

  expect(modelSessionInvalidatedCodec.decode(payload)).toStrictEqual({ itemID: 'item-1' });
});

test('it decodes the payload a writer encodes for a forgotten record', () => {
  const payload = modelSessionInvalidatedCodec.encode({ recordSequence: 12 });

  expect(modelSessionInvalidatedCodec.decode(payload)).toStrictEqual({ recordSequence: 12 });
});

test('it refuses a record sequence that is not a whole number', () => {
  expect(() => modelSessionInvalidatedCodec.decode({ recordSequence: 1.5 })).toThrow(
    /"path": \[\s+"recordSequence"\s+\]/u,
  );
});
