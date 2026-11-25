import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/client';
import { describeConnectionError } from './describe-connection-error';

test('#describeConnectionError words a typed error by its code', () => {
  expect(describeConnectionError(new ORPCError('CLIENT_MISSING'))).toBe(
    'Register an OAuth client before you connect an account.',
  );
});

test('#describeConnectionError words an unknown code as a refusal', () => {
  expect(describeConnectionError(new ORPCError('SOMETHING_ELSE'))).toBe(
    'nixie refused this, so nothing changed.',
  );
});

test('#describeConnectionError words a failure that is no typed error as an unknown result', () => {
  expect(describeConnectionError(new Error('network down'))).toBe(
    'nixie did not answer, so this may or may not have changed. Reload the page before you try again.',
  );
});
