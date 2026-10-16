import { expect, test } from 'bun:test';
import { toErrorFields } from './to-error-fields';

test('it keeps an error’s name and message', () => {
  expect(toErrorFields(new RangeError('the lease expired'))).toStrictEqual({
    error: 'RangeError',
    message: 'the lease expired',
  });
});

test('it keeps only the type of a thrown value that is not an error', () => {
  expect(toErrorFields('a thrown string')).toStrictEqual({ error: 'string', message: null });
});
