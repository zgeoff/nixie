import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { describePasskeyError } from './describe-passkey-error';

test('it names the cause of a host code that no longer works', () => {
  const words = describePasskeyError(new ORPCError('CODE_INVALID'));

  expect(words).toBe('That code is unknown, used or lapsed. Run nixie passkey-code for a new one.');
});

test('it says that an address with no domain name cannot hold a passkey', () => {
  const words = describePasskeyError(new ORPCError('ORIGIN_UNSUPPORTED'));

  expect(words).toBe(
    'A passkey needs this page to open on an https address with a domain name, not an IP address.',
  );
});

test('it says that a cancelled prompt changed nothing', () => {
  const cancelled = new Error('the prompt closed');

  cancelled.name = 'NotAllowedError';

  expect(describePasskeyError(cancelled)).toBe(
    'The passkey prompt was cancelled, so nothing changed.',
  );
});

test('it falls back to a retry line for a refusal it does not name', () => {
  expect(describePasskeyError(new ORPCError('SOMETHING_NEW'))).toBe(
    'The host refused this, so nothing changed.',
  );
});

test('it falls back to a retry line for an error that is not a refusal', () => {
  expect(describePasskeyError(new TypeError('network'))).toBe(
    'The passkey call did not finish, so nothing changed. Try again.',
  );
});
