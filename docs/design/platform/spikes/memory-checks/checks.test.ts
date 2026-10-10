import { expect, test } from 'bun:test';
import { CASES } from './cases.ts';
import { checkWrite, findQuotedBlocks, findTokens } from './checks.ts';

for (const sample of CASES) {
  test(sample.name, () => {
    expect(checkWrite(sample.message, sample.write).ok).toBe(sample.expect);
  });
}

test('an email is one token, not an email and a domain', () => {
  expect(findTokens('write to a@example.com').map((token) => token.kind)).toEqual(['email']);
});

test('an unclosed fence runs to the end of the message', () => {
  expect(findQuotedBlocks('look\n```\nsecret')).toEqual([[5, 15]]);
});
