import { expect, test } from 'bun:test';
import { buildStubEncoder } from './build-stub-encoder';

test('it encodes a text as the unit vector over the numbers of the topics its words name', () => {
  const encoder = buildStubEncoder([['sister', 'sibling'], ['boiler', 'heating'], ['leeds']]);

  // 2 of 3 topics, 16 numbers each: 32 numbers of 1 / sqrt(32)
  const named = Array.from({ length: 16 }, () => Math.fround(1 / Math.sqrt(32)));
  const unnamed = Array.from({ length: 16 }, () => 0);

  expect(encoder.encode(['My SISTER lives in Leeds'], 'document')).resolves.toStrictEqual([
    Float32Array.from([...named, ...unnamed, ...named]),
  ]);
});

test('it encodes two texts that name a topic in different words as the same vector', async () => {
  const encoder = buildStubEncoder([
    ['sister', 'sibling'],
    ['boiler', 'heating'],
  ]);

  const [first, second] = await encoder.encode(
    ['where does my sibling live', 'Ana is my sister'],
    'query',
  );

  expect(first).toStrictEqual(second);
});

test('it encodes a text that names no topic as all zeros', () => {
  const encoder = buildStubEncoder([
    ['sister', 'sibling'],
    ['boiler', 'heating'],
  ]);

  expect(encoder.encode(['hello there'], 'query')).resolves.toStrictEqual([new Float32Array(32)]);
});
