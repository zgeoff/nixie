import { expect, test } from 'bun:test';
import { formatGitHubMessage } from './format-github-message';

test.each([
  ['a body with no message', { documentation_url: 'https://docs.example.test' }, 'no message'],
  ['a body that is not an object', null, 'no message'],
  ['a plain message', { message: 'Not Found' }, 'Not Found'],
  ['a known secret', { message: 'bad token opaque-secret-1' }, 'bad token [redacted]'],
  ['a bearer value', { message: 'sent Bearer abc.def-ghi' }, 'sent [redacted]'],
  ['a JWT', { message: 'jwt aaaaaaaa.bbbbbbbb.cccccccc here' }, 'jwt [redacted] here'],
  ['an installation token', { message: 'token ghs_abc123XYZ' }, 'token [redacted]'],
  [
    'a PEM block',
    { message: 'key -----BEGIN PRIVATE KEY-----\nMIIE\n-----END PRIVATE KEY----- end' },
    'key [redacted] end',
  ],
])('it formats %s', (_title, body, expected) => {
  expect(formatGitHubMessage(body, ['opaque-secret-1'])).toBe(expected);
});
