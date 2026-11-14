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
