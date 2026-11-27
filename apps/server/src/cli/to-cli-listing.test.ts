import { expect, test } from 'bun:test';
import { toCLIListing } from './to-cli-listing';

test('it drops the expression of each condition, however deep, and keeps the rest', () => {
  const listed = toCLIListing([
    {
      ruleID: 'allow-mail',
      lastFiredAt: new Date(0),
      condition: { note: 'A note.', noteBy: 'you', words: 'the hour is before 17', source: 'x' },
    },
    {
      changes: [
        { before: null, after: { sentence: 'Allow.', condition: { note: 'n', source: 'y' } } },
      ],
    },
  ]);

  expect(listed).toStrictEqual([
    {
      ruleID: 'allow-mail',
      lastFiredAt: new Date(0),
      condition: { note: 'A note.', noteBy: 'you', words: 'the hour is before 17' },
    },
    { changes: [{ before: null, after: { sentence: 'Allow.', condition: { note: 'n' } } }] },
  ]);
});
