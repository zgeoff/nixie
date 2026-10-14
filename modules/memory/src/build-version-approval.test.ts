import { expect, test } from 'bun:test';
import { buildVersionApproval } from './build-version-approval';

test('it gives a version that applied at once no approval', () => {
  expect(buildVersionApproval(null, null)).toBeNull();
});

test.each([
  ['a quote that touched words you did not type', 'quote_not_typed'],
  ['a quote in a quoted block', 'quote_in_quoted_block'],
] as const)('it marks a proposal held for %s as a pasted page', (_name, reason) => {
  expect(buildVersionApproval('proposal-1', reason)).toStrictEqual({ isQuotePasted: true });
});

test.each([
  ['a proposal with no quote', 'no_quote'],
  ['a proposal the checker was unsure of', 'checker_unsure'],
  ['a consolidation change, which has no review reason', null],
] as const)('it marks %s as approved and not pasted', (_name, reason) => {
  expect(buildVersionApproval('proposal-1', reason)).toStrictEqual({ isQuotePasted: false });
});
