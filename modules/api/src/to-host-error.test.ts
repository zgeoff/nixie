import { expect, test } from 'bun:test';
import { ORPCError } from '@orpc/server';
import { toHostError } from './to-host-error';

test('it passes an oRPC error through as it is', () => {
  const error = new ORPCError('BAD_REQUEST', { message: 'Input validation failed' });

  expect(toHostError(error, {})).toBe(error);
});

test('it builds the declared error for the code a memory store error carries', () => {
  const error = Object.assign(new Error('the item has moved past version 1'), {
    code: 'STALE_VERSION',
  });

  const built = toHostError(error, {
    STALE_VERSION: (options) => new ORPCError('STALE_VERSION', { status: 409, ...options }),
  });

  expect(built).toMatchObject({
    code: 'STALE_VERSION',
    status: 409,
    message: 'the item has moved past version 1',
    cause: error,
  });
});

test('it answers 500 with the reason of an error whose code the contract does not declare', () => {
  const error = Object.assign(new Error('the change is closed'), { code: 'CHANGE_CLOSED' });

  expect(toHostError(error, {})).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'the change is closed',
    cause: error,
  });
});

test('it answers 500 with the text of a thrown value that is not an error', () => {
  expect(toHostError('the database is locked', {})).toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'the database is locked',
  });
});
