import { expect, test } from 'bun:test';
import { buildCheckLink } from '../test-utils/build-check-link';
import { buildCheckNote } from '../test-utils/build-check-note';
import { buildCheck, normalizeReason } from './build-check';

test('it keeps a note with a link out from the orphans', () => {
  const check = buildCheck([buildCheckNote('aaaaaaaaaa', 1)], [buildCheckLink('aaaaaaaaaa')], {
    checkReasonRepeats: 3,
    isPrivateShown: true,
  });

  expect(check.orphans).toStrictEqual([]);
});

test('it keeps a note that an active note links to from the orphans', () => {
  const check = buildCheck(
    [buildCheckNote('aaaaaaaaaa', 1), buildCheckNote('bbbbbbbbbb', 2)],
    [
      buildCheckLink('bbbbbbbbbb', {
        kind: 'note',
        targetID: 'aaaaaaaaaa-uuid',
        targetShownID: 'aaaaaaaaaa',
      }),
    ],
    { checkReasonRepeats: 3, isPrivateShown: true },
  );

  expect(check.orphans).toStrictEqual([]);
});

test('it lists the orphans oldest edit first, each with its title and the total', () => {
  const check = buildCheck(
    [buildCheckNote('cccccccccc', 30), buildCheckNote('aaaaaaaaaa', 10)],
    [],
    { checkReasonRepeats: 3, isPrivateShown: true },
  );

  expect(check).toStrictEqual({
    orphans: [
      { note: 'aaaaaaaaaa', title: 'Title aaaaaaaaaa' },
      { note: 'cccccccccc', title: 'Title cccccccccc' },
    ],
    dangling: [],
    repeatedReasons: [],
    orphanCount: 2,
    danglingCount: 0,
    repeatedReasonCount: 0,
  });
});

test('it lists a link whose target is gone as dangling', () => {
  const check = buildCheck(
    [buildCheckNote('aaaaaaaaaa', 1)],
    [buildCheckLink('aaaaaaaaaa', { type: 'disputes', isGone: true })],
    { checkReasonRepeats: 3, isPrivateShown: true },
  );

  expect(check.dangling).toStrictEqual([
    { from: 'aaaaaaaaaa', to: { memory: 'itemshort1' }, type: 'disputes' },
  ]);
});

test('it counts the same reason after trimming, collapsing spaces and ignoring case', () => {
  const reasons = ['same trip', ' Same  Trip', 'SAME TRIP ', 'same trip'];

  const check = buildCheck(
    [buildCheckNote('aaaaaaaaaa', 1)],
    reasons.map((reason, index) =>
      buildCheckLink('aaaaaaaaaa', {
        type: 'related',
        reason,
        targetID: `item-${String(index)}`,
        targetShownID: `item${String(index)}`,
      }),
    ),
    { checkReasonRepeats: 3, isPrivateShown: true },
  );

  expect([check.repeatedReasonCount, check.repeatedReasons[0]?.count]).toStrictEqual([1, 4]);
});

test('it leaves a reason on as many links as the setting alone', () => {
  const check = buildCheck(
    [buildCheckNote('aaaaaaaaaa', 1)],
    ['x', 'x', 'x'].map((reason, index) =>
      buildCheckLink('aaaaaaaaaa', { type: 'related', reason, targetID: `item-${String(index)}` }),
    ),
    { checkReasonRepeats: 3, isPrivateShown: true },
  );

  expect(check.repeatedReasons).toStrictEqual([]);
});

test('it cuts each list at 50 entries and keeps the totals', () => {
  const notes = Array.from({ length: 60 }, (_, index) =>
    buildCheckNote(`note${String(index).padStart(6, '0')}`, index),
  );

  const check = buildCheck(notes, [], { checkReasonRepeats: 3, isPrivateShown: true });

  expect([check.orphans.length, check.orphanCount]).toStrictEqual([50, 60]);
});

test('it builds over every note and then leaves out the entries of a private note', () => {
  const notes = [buildCheckNote('aaaaaaaaaa', 1, true), buildCheckNote('bbbbbbbbbb', 2)];

  const links = [
    buildCheckLink('aaaaaaaaaa', {
      kind: 'note',
      targetID: 'bbbbbbbbbb-uuid',
      targetShownID: 'bbbbbbbbbb',
    }),
    buildCheckLink('aaaaaaaaaa', { isGone: true, targetID: 'gone-uuid' }),
  ];

  const check = buildCheck(notes, links, {
    checkReasonRepeats: 3,
    isPrivateShown: false,
  });

  expect(check).toStrictEqual({
    orphans: [],
    dangling: [],
    repeatedReasons: [],
    orphanCount: 0,
    danglingCount: 0,
    repeatedReasonCount: 0,
  });
});

test.each([
  ['  Hello   World ', 'hello world'],
  ['ALREADY lower', 'already lower'],
])('it normalizes the reason %j to %j', (reason, expected) => {
  expect(normalizeReason(reason)).toBe(expected);
});

test('it leaves a private target out of a repeated reason when private notes are hidden', () => {
  const toPrivate = {
    type: 'related',
    kind: 'note',
    targetID: 'private-uuid',
    targetShownID: 'privateshort',
    reason: 'same topic',
  } as const;

  const check = buildCheck(
    [
      buildCheckNote('aaaaaaaaaa', 1),
      buildCheckNote('bbbbbbbbbb', 2),
      { ...buildCheckNote('cccccccccc', 3, true), noteID: 'private-uuid' },
    ],
    [buildCheckLink('aaaaaaaaaa', toPrivate), buildCheckLink('bbbbbbbbbb', toPrivate)],
    { checkReasonRepeats: 1, isPrivateShown: false },
  );

  expect(check.repeatedReasons).toStrictEqual([]);
});
