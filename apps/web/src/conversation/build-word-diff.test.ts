import { expect, test } from 'bun:test';
import { buildWordDiff } from './build-word-diff';

test('it marks the words an edit replaced and the words it kept', () => {
  expect(buildWordDiff('Plays the cello on Thursdays', 'Plays the viola on Fridays')).toStrictEqual(
    [
      { kind: 'same', text: 'Plays the ' },
      { kind: 'removed', text: 'cello' },
      { kind: 'added', text: 'viola' },
      { kind: 'same', text: ' on ' },
      { kind: 'removed', text: 'Thursdays' },
      { kind: 'added', text: 'Fridays' },
    ],
  );
});

test('it gives the same diff for the same texts', () => {
  expect(buildWordDiff('Rents a flat', 'Rents a small flat')).toStrictEqual(
    buildWordDiff('Rents a flat', 'Rents a small flat'),
  );
});

test('it marks words an edit added at the end', () => {
  expect(buildWordDiff('Rents a flat', 'Rents a flat on Mill Lane')).toStrictEqual([
    { kind: 'same', text: 'Rents a flat' },
    { kind: 'added', text: ' on Mill Lane' },
  ]);
});

test('it marks words an edit removed from the start', () => {
  expect(buildWordDiff('Still rents a flat', 'rents a flat')).toStrictEqual([
    { kind: 'removed', text: 'Still ' },
    { kind: 'same', text: 'rents a flat' },
  ]);
});

test('it reads two equal texts as one unchanged run', () => {
  expect(buildWordDiff('Drinks oat milk', 'Drinks oat milk')).toStrictEqual([
    { kind: 'same', text: 'Drinks oat milk' },
  ]);
});

test('it reads an empty earlier text as all added', () => {
  expect(buildWordDiff('', 'Drinks oat milk')).toStrictEqual([
    { kind: 'added', text: 'Drinks oat milk' },
  ]);
});

test('it diffs two long texts that differ in one place, keeping the shared ends', () => {
  const words = Array.from({ length: 3000 }, (_, index) => `word${index}`);
  const head = words.slice(0, 1500).join(' ');
  const tail = words.slice(1501).join(' ');

  expect(buildWordDiff(`${head} word1500 ${tail}`, `${head} changed ${tail}`)).toStrictEqual([
    { kind: 'same', text: `${head} ` },
    { kind: 'removed', text: 'word1500' },
    { kind: 'added', text: 'changed' },
    { kind: 'same', text: ` ${tail}` },
  ]);
});

test('it marks the whole middle as replaced when two long texts share only their ends', () => {
  const before = Array.from({ length: 2000 }, (_, index) => `old${index}`).join(' ');
  const after = Array.from({ length: 2000 }, (_, index) => `new${index}`).join(' ');

  expect(buildWordDiff(`start ${before} end`, `start ${after} end`)).toStrictEqual([
    { kind: 'same', text: 'start ' },
    { kind: 'removed', text: before },
    { kind: 'added', text: after },
    { kind: 'same', text: ' end' },
  ]);
});
