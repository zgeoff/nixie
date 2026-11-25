import { expect, test } from 'bun:test';
import { formatMissingScope } from './format-missing-scope';

test.each([
  [
    { scope: 'gmail.modify', reason: 'not_granted' },
    'gmail.modify: Google did not grant it. This holds back every gmail tool.',
  ],
  [
    { scope: 'drive.file', reason: 'api_disabled' },
    'drive.file: its API is off in your Google Cloud project. This holds back every drive tool and the Drive picker.',
  ],
  [{ scope: 'other.scope', reason: 'not_granted' }, 'other.scope: Google did not grant it.'],
] as const)('#formatMissingScope words %j', (missing, text) => {
  expect(formatMissingScope(missing)).toBe(text);
});
