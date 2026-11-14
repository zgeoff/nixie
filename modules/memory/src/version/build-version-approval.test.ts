import { expect, test } from 'bun:test';
import { buildVersionApproval } from './build-version-approval';

test('it gives a version that applied at once no approval', () => {
  expect(buildVersionApproval(null, null)).toBeNull();
});

test('it marks a remember proposal held for a quote in a quoted block as a pasted page', () => {
  expect(
    buildVersionApproval('proposal-1', { operation: 'remember', reason: 'quote_in_quoted_block' }),
  ).toStrictEqual({ isQuotePasted: true });
});

test('it never marks a retirement as a pasted page, because its quote backs only the retirement', () => {
  expect(
    buildVersionApproval('proposal-1', { operation: 'retire', reason: 'quote_in_quoted_block' }),
  ).toStrictEqual({ isQuotePasted: false });
});

test.each([
  ['a proposal with no quote', 'no_quote'],
  [
    'a proposal whose quote was not typed, which a reply or a tool result also gives',
    'quote_not_typed',
  ],
  ['a proposal the checker was unsure of', 'checker_unsure'],
] as const)('it marks %s as approved and not pasted', (_name, reason) => {
  expect(buildVersionApproval('proposal-1', { operation: 'remember', reason })).toStrictEqual({
    isQuotePasted: false,
  });
});

test('it marks a consolidation change, which has no proposal row, as approved and not pasted', () => {
  expect(buildVersionApproval('change-1', null)).toStrictEqual({ isQuotePasted: false });
});
