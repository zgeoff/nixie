import { expect, test } from 'bun:test';
import { pickLinkRefusal } from './pick-link-refusal';

test.each([
  ['supersedes', 'note', true],
  ['supersedes', 'memory', true],
  ['supersedes', 'moment', false],
  ['supersedes', 'event', false],
  ['disputes', 'memory', true],
  ['disputes', 'event', false],
  ['part-of', 'note', true],
  ['part-of', 'memory', false],
  ['cites', 'event', true],
  ['cites', 'moment', true],
  ['related', 'moment', true],
] as const)('it %s a %s: %s', (type, kind, isAllowed) => {
  const refusal = pickLinkRefusal({ from: 'n1', kind, type, reason: 'because', isSelf: false });

  expect(refusal === null).toBe(isAllowed);
});

test('it refuses a link to the note itself before it checks the kind', () => {
  expect(
    pickLinkRefusal({
      from: 'n1',
      kind: 'event',
      type: 'supersedes',
      reason: undefined,
      isSelf: true,
    })?.code,
  ).toBe('SELF_LINK');
});

test('it checks the kind before the reason', () => {
  expect(
    pickLinkRefusal({
      from: 'n1',
      kind: 'event',
      type: 'part-of',
      reason: undefined,
      isSelf: false,
    })?.code,
  ).toBe('BAD_LINK');
});

test('it needs a reason for a related link only', () => {
  const related = pickLinkRefusal({
    from: 'n1',
    kind: 'note',
    type: 'related',
    reason: undefined,
    isSelf: false,
  });

  const cites = pickLinkRefusal({
    from: 'n1',
    kind: 'note',
    type: 'cites',
    reason: undefined,
    isSelf: false,
  });

  expect([related?.code, cites]).toStrictEqual(['REASON_REQUIRED', null]);
});
