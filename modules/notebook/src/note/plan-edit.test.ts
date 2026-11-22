import { expect, test } from 'bun:test';
import { buildCurrentNote } from '../test-utils/build-current-note';
import { planEdit } from './plan-edit';

test.each([
  ['sets no field', { version: 2 }, 'NOTHING_TO_CHANGE'],
  [
    'sets body with changes',
    { version: 2, body: 'x', changes: [{ find: 'a', replace: 'b' }] },
    'BODY_AND_CHANGES',
  ],
  ['sets body with append', { version: 2, body: 'x', append: 'y' }, 'BODY_AND_CHANGES'],
  ['sets a title and no version', { title: 'New' }, 'VERSION_REQUIRED'],
  ['reads an old version', { version: 1, title: 'New' }, 'STALE_VERSION'],
  [
    'changes text that is not there',
    { version: 2, changes: [{ find: 'zzz', replace: 'x' }] },
    'NO_MATCH',
  ],
  [
    'changes text that is there twice',
    { version: 2, changes: [{ find: 'cold', replace: 'x' }] },
    'MANY_MATCHES',
  ],
] as const)('it refuses an edit that %s with the right code', (_title, input, code) => {
  const plan = planEdit(buildCurrentNote(), input, 1000);

  expect(plan).toMatchObject({ kind: 'refused', refusal: { code } });
});

test('it checks NOTHING_TO_CHANGE before a missing version', () => {
  const plan = planEdit(buildCurrentNote(), {}, 1000);

  expect(plan).toMatchObject({ kind: 'refused', refusal: { code: 'NOTHING_TO_CHANGE' } });
});

test('it carries the current version with a stale version refusal', () => {
  const plan = planEdit(buildCurrentNote(), { version: 1, title: 'New' }, 1000);

  expect(plan).toMatchObject({ refusal: { figures: { currentVersion: 2 } } });
});

test('it builds the whole new version for a body edit that keeps the other fields', () => {
  expect(planEdit(buildCurrentNote(), { version: 2, body: 'A new body.' }, 1000)).toStrictEqual({
    kind: 'edit',
    title: 'Why the boiler keeps tripping',
    body: 'A new body.',
    tags: ['home', 'boiler'],
    isPrivate: false,
  });
});

test('it applies the changes and then the append', () => {
  const plan = planEdit(
    buildCurrentNote(),
    { version: 2, changes: [{ find: 'after a cold night', replace: 'later' }], append: ' More.' },
    1000,
  );

  expect(plan).toMatchObject({ kind: 'edit', body: 'The trip happens later. Cold is cold. More.' });
});

test('it takes an append alone with no version', () => {
  const plan = planEdit(buildCurrentNote(), { append: ' More.' }, 1000);

  expect(plan).toMatchObject({
    kind: 'edit',
    body: 'The trip happens after a cold night. Cold is cold. More.',
  });
});

test('it merges the tags of an edit ignoring case, and clears them with an empty list', () => {
  const merged = planEdit(buildCurrentNote(), { version: 2, tags: ['Home', 'home', 'zine'] }, 1000);
  const cleared = planEdit(buildCurrentNote(), { version: 2, tags: [] }, 1000);

  expect([
    merged.kind === 'edit' ? merged.tags : null,
    cleared.kind === 'edit' ? cleared.tags : null,
  ]).toStrictEqual([['Home', 'zine'], []]);
});

test('it makes a new version for a change of the private flag alone', () => {
  const plan = planEdit(buildCurrentNote(), { version: 2, isPrivate: true }, 1000);

  expect(plan).toMatchObject({ kind: 'edit', isPrivate: true });
});

test('it checks NOTE_TOO_LONG against the result of the changes and the append', () => {
  const plan = planEdit(buildCurrentNote(), { version: 2, append: 'x'.repeat(100) }, 100);

  expect(plan).toMatchObject({ kind: 'refused', refusal: { code: 'NOTE_TOO_LONG' } });
});
