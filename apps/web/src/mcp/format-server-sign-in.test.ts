import { expect, test } from 'bun:test';
import { formatServerSignIn } from './format-server-sign-in';

test.each([
  ['not_added', 'Waiting for your approval'],
  ['no_grant', 'Not signed in'],
  ['needs_consent', 'Needs sign-in'],
  ['ok', 'Signed in'],
] as const)('it words the sign-in %s as "%s"', (signIn, text) => {
  expect(formatServerSignIn(signIn)).toBe(text);
});
