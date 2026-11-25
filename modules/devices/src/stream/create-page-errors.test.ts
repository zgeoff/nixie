import { expect, test } from 'bun:test';
import { createPageErrors, pageErrorLimit } from './create-page-errors';

test('it returns the errors of a region whose content is still the one that raised them', () => {
  const errors = createPageErrors();

  errors.record('dev1', { region: 'pond', shown: 'aaa', atMs: 1, message: 'TypeError: x' });

  expect(errors.read('dev1', new Map([['pond', 'aaa']]))).toStrictEqual([
    { region: 'pond', shown: 'aaa', atMs: 1, message: 'TypeError: x' },
  ]);
});

test('it returns no error for a region whose content changed since', () => {
  const errors = createPageErrors();

  errors.record('dev1', { region: 'pond', shown: 'aaa', atMs: 1, message: 'old' });

  expect(errors.read('dev1', new Map([['pond', 'bbb']]))).toStrictEqual([]);
});

test('it drops the errors of old content when the region reports an error of new content', () => {
  const errors = createPageErrors();

  errors.record('dev1', { region: 'pond', shown: 'aaa', atMs: 1, message: 'old' });
  errors.record('dev1', { region: 'pond', shown: 'bbb', atMs: 2, message: 'new' });

  expect(errors.read('dev1', new Map([['pond', 'aaa']]))).toStrictEqual([]);
});

test('it keeps the newest 20 errors of a region', () => {
  const errors = createPageErrors();

  for (let index = 0; index < pageErrorLimit + 5; index += 1) {
    errors.record('dev1', { region: 'pond', shown: 'aaa', atMs: index, message: `e${index}` });
  }

  const kept = errors.read('dev1', new Map([['pond', 'aaa']]));

  expect({ count: kept.length, first: kept[0]?.message, last: kept.at(-1)?.message }).toStrictEqual(
    {
      count: 20,
      first: 'e5',
      last: 'e24',
    },
  );
});

test('it keeps the errors of each device apart', () => {
  const errors = createPageErrors();

  errors.record('dev1', { region: 'pond', shown: 'aaa', atMs: 1, message: 'one' });

  expect(errors.read('dev2', new Map([['pond', 'aaa']]))).toStrictEqual([]);
});
