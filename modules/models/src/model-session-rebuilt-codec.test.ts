import { expect, test } from 'bun:test';
import { modelSessionRebuiltCodec } from './model-session-rebuilt-codec';

test('it decodes the payload a writer encodes', () => {
  const payload = modelSessionRebuiltCodec.encode({ reason: 'missing', recalledThrough: 12 });

  expect(modelSessionRebuiltCodec.decode(payload)).toStrictEqual({
    reason: 'missing',
    recalledThrough: 12,
  });
});

test('it reads a rebuild recorded before rebuilds kept their recall mark', () => {
  expect(modelSessionRebuiltCodec.tryDecodePartial({ reason: 'lost' })).toStrictEqual({
    reason: 'lost',
  });
});

test('it refuses a recall mark below zero', () => {
  expect(() => modelSessionRebuiltCodec.decode({ reason: 'lost', recalledThrough: -1 })).toThrow(
    /"path": \[\s+"recalledThrough"\s+\]/u,
  );
});
