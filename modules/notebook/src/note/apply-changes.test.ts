import { expect, test } from 'bun:test';
import { applyChanges } from './apply-changes';

test('it replaces a single match', () => {
  expect(
    applyChanges('The trip happens after a cold night.', [
      { find: 'after a cold night', replace: 'after a night under 2 °C' },
    ]),
  ).toStrictEqual({ kind: 'applied', body: 'The trip happens after a night under 2 °C.' });
});

test('it applies each change to the result of the one before', () => {
  expect(
    applyChanges('alpha', [
      { find: 'alpha', replace: 'beta' },
      { find: 'beta', replace: 'gamma' },
    ]),
  ).toStrictEqual({ kind: 'applied', body: 'gamma' });
});

test('it replaces every match of a change with all set', () => {
  expect(applyChanges('a b a b a', [{ find: 'a', replace: 'x', all: true }])).toStrictEqual({
    kind: 'applied',
    body: 'x b x b x',
  });
});

test('it keeps a dollar sequence in a replacement as plain text', () => {
  expect(applyChanges('price', [{ find: 'price', replace: '$& and $1' }])).toStrictEqual({
    kind: 'applied',
    body: '$& and $1',
  });
});

test('it refuses a change that matches nowhere and names its index', () => {
  expect(
    applyChanges('alpha', [
      { find: 'alpha', replace: 'beta' },
      { find: 'zeta', replace: 'x' },
    ]),
  ).toStrictEqual({ kind: 'no_match', index: 1 });
});

test('it refuses a change with several matches and no all, with the count', () => {
  expect(applyChanges('a b a', [{ find: 'a', replace: 'x' }])).toStrictEqual({
    kind: 'many_matches',
    index: 0,
    count: 2,
  });
});
