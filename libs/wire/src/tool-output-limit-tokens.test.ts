import { expect, test } from 'bun:test';
import { toolOutputLimitTokens } from './tool-output-limit-tokens';

// the CLI cuts a result to 4 characters a token, adds a notice of about 400 characters, and saves
// a result past 50,000 characters to a file
test('it keeps a result the CLI cuts under the size the CLI saves to a file', () => {
  expect(toolOutputLimitTokens * 4 + 400).toBeLessThan(50_000);
});
