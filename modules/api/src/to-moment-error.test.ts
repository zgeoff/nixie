import { expect, test } from 'bun:test';
import { MomentRefusedError } from './moment-refused-error';
import { toMomentError } from './to-moment-error';

test.each([
  ['not_found', 'the moment is missing'],
  ['stale', 'the version is stale'],
])('it maps a refusal as %s to its error', (reason, message) => {
  expect(
    toMomentError(new MomentRefusedError(reason), {
      MOMENT_NOT_FOUND: () => new Error('the moment is missing'),
      STALE_VERSION: () => new Error('the version is stale'),
    }),
  ).toStrictEqual(new Error(message));
});

test('it passes on an error that is no refusal', () => {
  const error = new Error('the disk is full');

  expect(
    toMomentError(error, {
      MOMENT_NOT_FOUND: () => new Error('the moment is missing'),
      STALE_VERSION: () => new Error('the version is stale'),
    }),
  ).toBe(error);
});
