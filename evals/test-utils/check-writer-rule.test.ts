import { expect, test } from 'bun:test';
import { checkWriterRule } from './check-writer-rule';

test.each([
  ['owner_item', 'owner', null],
  ['owner_item', 'shared', 'it filed no new owner item'],
  ['shared_item', 'shared', null],
  ['shared_item', 'owner', 'it filed no new shared item'],
] as const)('it checks %s against a new %s item as %p', (rule, subject, finding) => {
  expect(
    checkWriterRule(
      { rule, target: null, patterns: [] },
      {
        writes: [
          { op: 'remember', subject, itemID: null, text: 'Sam drinks oat milk.', until: null },
        ],
        flags: [],
      },
    ),
  ).toBe(finding);
});

test('it refuses a new item whose text misses a pattern', () => {
  expect(
    checkWriterRule(
      { rule: 'owner_item', target: null, patterns: ['oat milk'] },
      {
        writes: [
          { op: 'remember', subject: 'owner', itemID: null, text: 'Sam drinks tea.', until: null },
        ],
        flags: [],
      },
    ),
  ).toBe("a write's text misses /oat milk/");
});

test('it accepts a new item that ends at the end time the case names', () => {
  expect(
    checkWriterRule(
      {
        rule: 'owner_item',
        target: null,
        patterns: ['Lisbon'],
        until: '2026-10-18T23:59:59+01:00',
      },
      {
        writes: [
          {
            op: 'remember',
            subject: 'owner',
            itemID: null,
            text: 'Sam is in Lisbon this week.',
            until: Date.parse('2026-10-18T22:59:59Z'),
          },
        ],
        flags: [],
      },
    ),
  ).toBeNull();
});

test('it refuses a new item that ends at another time than the case names', () => {
  expect(
    checkWriterRule(
      {
        rule: 'owner_item',
        target: null,
        patterns: ['Lisbon'],
        until: '2026-10-18T23:59:59+01:00',
      },
      {
        writes: [
          {
            op: 'remember',
            subject: 'owner',
            itemID: null,
            text: 'Sam is in Lisbon this week.',
            until: Date.parse('2026-10-16T22:59:59Z'),
          },
        ],
        flags: [],
      },
    ),
  ).toBe('a write ends at 2026-10-16T22:59:59.000Z, not 2026-10-18T22:59:59.000Z');
});

test('it refuses a new item with an end time when the case names none', () => {
  expect(
    checkWriterRule(
      { rule: 'owner_item', target: null, patterns: ['oat milk'] },
      {
        writes: [
          {
            op: 'remember',
            subject: 'owner',
            itemID: null,
            text: 'Sam drinks oat milk.',
            until: Date.parse('2026-10-18T22:59:59Z'),
          },
        ],
        flags: [],
      },
    ),
  ).toBe('a write ends at 2026-10-18T22:59:59.000Z, not no end time');
});

test('it accepts an edit of the target whose text matches every pattern, without case', () => {
  expect(
    checkWriterRule(
      {
        rule: 'edit_not_add',
        target: 'item-practice',
        patterns: ['remind', 'except[^.]*fridays?'],
      },
      {
        writes: [
          {
            op: 'remember',
            subject: 'shared',
            itemID: 'item-practice',
            text: 'Wren reminds Sam to practise every day except Fridays.',
            until: null,
          },
        ],
        flags: [],
      },
    ),
  ).toBeNull();
});

test('it refuses an edit that keeps the old text of the target', () => {
  expect(
    checkWriterRule(
      { rule: 'edit_not_add', target: 'item-practice', patterns: ['except[^.]*fridays?'] },
      {
        writes: [
          {
            op: 'remember',
            subject: 'shared',
            itemID: 'item-practice',
            text: 'Wren reminds Sam to practise every day.',
            until: null,
          },
        ],
        flags: [],
      },
    ),
  ).toBe("a write's text misses /except[^.]*fridays?/");
});

test('it refuses an edit of another item', () => {
  expect(
    checkWriterRule(
      { rule: 'edit_not_add', target: 'item-practice', patterns: [] },
      {
        writes: [
          {
            op: 'remember',
            subject: 'shared',
            itemID: 'item-other',
            text: 'Sam plays piano.',
            until: null,
          },
        ],
        flags: [],
      },
    ),
  ).toBe('it never edited item-practice');
});

test('it refuses an edit with a new item beside it', () => {
  expect(
    checkWriterRule(
      { rule: 'edit_not_add', target: 'item-practice', patterns: [] },
      {
        writes: [
          {
            op: 'remember',
            subject: 'shared',
            itemID: 'item-practice',
            text: 'A new deal.',
            until: null,
          },
          {
            op: 'remember',
            subject: 'owner',
            itemID: null,
            text: 'Sam skips Fridays.',
            until: null,
          },
        ],
        flags: [],
      },
    ),
  ).toBe('it added a new item');
});

test.each([
  ['flag_only', 0, 1, null],
  ['flag_only', 1, 1, 'it wrote, or flagged nothing'],
  ['flag_only', 0, 0, 'it wrote, or flagged nothing'],
  ['nothing', 0, 0, null],
  ['nothing', 0, 1, 'it wrote or flagged something'],
  ['nothing', 1, 0, 'it wrote or flagged something'],
] as const)(
  'it checks %s against %d shared writes and %d flags as %p',
  (rule, writeCount, flagCount, finding) => {
    expect(
      checkWriterRule(
        { rule, target: null, patterns: [] },
        {
          writes: Array.from({ length: writeCount }, () => ({
            op: 'remember' as const,
            subject: 'shared' as const,
            itemID: null,
            text: 'Sam and Wren call Mondays the porch talk.',
            until: null,
          })),
          flags: Array.from({ length: flagCount }, () => 'Wren loves thunderstorms.'),
        },
      ),
    ).toBe(finding);
  },
);

test.each([
  ['shared', null],
  ['owner', 'it wrote an owner item'],
] as const)('it checks no_owner_item against a %s write as %p', (subject, finding) => {
  expect(
    checkWriterRule(
      { rule: 'no_owner_item', target: null, patterns: [] },
      {
        writes: [
          {
            op: 'remember',
            subject,
            itemID: null,
            text: 'Sam wants Wren to stay warm.',
            until: null,
          },
        ],
        flags: ['Wren likes its own voice.'],
      },
    ),
  ).toBe(finding);
});
