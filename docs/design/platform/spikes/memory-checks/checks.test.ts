import { expect, test } from 'bun:test';
import { CASES } from './cases.ts';
import { checkWrite, findQuotedBlocks, findTokens } from './checks.ts';

test.each(CASES)('#checkWrite returns ok $expect for $name', (sample) => {
  expect(checkWrite(sample.message, sample.write).ok).toBe(sample.expect);
});

test('#findTokens reads an email as one token, not an email and a domain', () => {
  expect(findTokens('write to a@example.com').map((token) => token.kind)).toStrictEqual(['email']);
});

test('#findQuotedBlocks runs an unclosed fence to the end of the message', () => {
  expect(findQuotedBlocks('look\n```\nsecret')).toStrictEqual([[5, 15]]);
});
