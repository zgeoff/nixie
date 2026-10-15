import { expect, test } from 'bun:test';
import { countSummaryWords } from './count-summary-words';

test.each([
  [2000, 1400],
  [3000, 2100],
  [1234, 850],
  [100, 50],
])('it asks for a summary under a cap of %d tokens in %d words', (summaryTokens, words) => {
  expect(countSummaryWords(summaryTokens)).toBe(words);
});
