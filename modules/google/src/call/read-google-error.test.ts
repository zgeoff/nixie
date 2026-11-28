import { expect, test } from 'bun:test';
import { readGoogleError } from './read-google-error';

test.each([
  ['{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}', 403, true],
  ['{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}', 403, true],
  ['{"error":{"details":[{"reason":"rateLimitExceeded"}]}}', 403, true],
  [
    '{"error":{"message":"rateLimitExceeded","errors":[{"reason":"insufficientPermissions"}]}}',
    403,
    false,
  ],
  ['rateLimitExceeded', 403, false],
  ['{"error":{"errors":[{"reason":"rateLimitExceeded"}]}}', 400, false],
  ['', 429, true],
])('#readGoogleError reads %s with status %d as a rate limit: %p', (text, status, isRateLimit) => {
  expect(readGoogleError(text, status, 'Google').isRateLimit).toBe(isRateLimit);
});

test('#readGoogleError names the first structured reason, or the status when none is given', () => {
  expect([
    readGoogleError('{"error":{"errors":[{"reason":"notFound"}]}}', 404, 'Gmail').reason,
    readGoogleError('plain text', 502, 'Gmail').reason,
  ]).toStrictEqual(['Gmail answered notFound', 'Gmail answered 502']);
});
