import { expect, test } from 'bun:test';
import { classifyScopeRead } from './classify-scope-read';

test.each([
  { title: 'a 200', status: 200, body: '{}', expected: 'granted' },
  {
    title: 'a 403 for a scope the owner left out',
    status: 403,
    body: '{"error":{"errors":[{"reason":"insufficientPermissions"}]}}',
    expected: 'not_granted',
  },
  {
    title: 'a 403 for an API the project has not enabled',
    status: 403,
    body: '{"error":{"errors":[{"reason":"accessNotConfigured"}]}}',
    expected: 'api_disabled',
  },
  {
    title: 'a 403 whose details name a disabled service',
    status: 403,
    body: '{"error":{"details":[{"reason":"SERVICE_DISABLED"}]}}',
    expected: 'api_disabled',
  },
  {
    title: 'a 403 for the quota of one user',
    status: 403,
    body: '{"error":{"errors":[{"reason":"userRateLimitExceeded"}]}}',
    expected: 'unknown',
  },
  {
    title: 'a 403 for a daily limit',
    status: 403,
    body: '{"error":{"errors":[{"reason":"dailyLimitExceeded"}]}}',
    expected: 'unknown',
  },
  { title: 'a 401', status: 401, body: '', expected: 'not_granted' },
  { title: 'a 503', status: 503, body: '', expected: 'unknown' },
  { title: 'a 429', status: 429, body: '', expected: 'unknown' },
])('#classifyScopeRead reads $title as $expected', (row) => {
  expect(classifyScopeRead(row.status, row.body)).toBe(row.expected);
});
