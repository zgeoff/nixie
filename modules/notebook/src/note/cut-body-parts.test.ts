import { expect, test } from 'bun:test';
import { countJSONBytes, cutBodyParts } from './cut-body-parts';

test('it keeps a short body in one part', () => {
  expect(cutBodyParts('A short note.', 1000, 1000)).toStrictEqual(['A short note.']);
});

test('it gives an empty body one empty part', () => {
  expect(cutBodyParts('', 100, 100)).toStrictEqual(['']);
});

test('it cuts at a paragraph break and keeps the break with the part before', () => {
  const body = `${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n${'c'.repeat(30)}`;

  expect(cutBodyParts(body, 70, 70)).toStrictEqual([
    `${'a'.repeat(30)}\n\n${'b'.repeat(30)}\n\n`,
    'c'.repeat(30),
  ]);
});

test('it falls back to a line break, then a space, then a hard cut', () => {
  const lines = cutBodyParts(`${'a'.repeat(20)}\n${'b'.repeat(20)}`, 25, 25);
  const words = cutBodyParts(`${'a'.repeat(20)} ${'b'.repeat(20)}`, 25, 25);
  const hard = cutBodyParts('c'.repeat(50), 20, 20);

  expect([lines, words, hard]).toStrictEqual([
    [`${'a'.repeat(20)}\n`, 'b'.repeat(20)],
    [`${'a'.repeat(20)} `, 'b'.repeat(20)],
    ['c'.repeat(20), 'c'.repeat(20), 'c'.repeat(10)],
  ]);
});

test('it joins the parts to the body as written', () => {
  const body = Array.from({ length: 400 }, (_, index) => `Line ${String(index)} of the note.`).join(
    '\n',
  );

  expect(cutBodyParts(body, 900, 1100).join('')).toBe(body);
});

test('it spends the first budget on part 1 and the later budget on the rest', () => {
  const body = 'word '.repeat(200);
  const parts = cutBodyParts(body, 100, 300);

  expect([
    countJSONBytes(parts[0] ?? '') <= 100,
    parts.slice(1).every((part) => countJSONBytes(part) <= 300),
  ]).toStrictEqual([true, true]);
});

test('it counts multi-byte characters in the bytes of each part', () => {
  const body = '日本語のメモ'.repeat(50);
  const parts = cutBodyParts(body, 200, 200);

  expect(parts.every((part) => countJSONBytes(part) <= 200)).toBe(true);
});

test('it never cuts inside a surrogate pair', () => {
  const body = '😀'.repeat(60);
  const parts = cutBodyParts(body, 50, 50);

  expect(parts.join('')).toBe(body);
});
