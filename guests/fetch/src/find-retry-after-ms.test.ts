import { expect, test } from 'bun:test';
import { findRetryAfterMs } from './find-retry-after-ms';

test('it reads Retry-After seconds on a 429', () => {
  expect(findRetryAfterMs(429, { 'retry-after': '120' }, 1_000_000_000_000)).toBe(120_000);
});

test('it reads a Retry-After date on a 503', () => {
  expect(
    findRetryAfterMs(503, { 'retry-after': 'Sun, 09 Sep 2001 01:47:10 GMT' }, 1_000_000_000_000),
  ).toBe(30_000);
});

test('it reads a Retry-After date in the past as 0', () => {
  expect(
    findRetryAfterMs(429, { 'retry-after': 'Sun, 09 Sep 2001 01:46:10 GMT' }, 1_000_000_000_000),
  ).toBe(0);
});

test('it counts Retry-After on a 403 and ignores it on a 200 and a 404', () => {
  const headers = { 'retry-after': '5' };

  expect(findRetryAfterMs(403, headers, 1_000_000_000_000)).toBe(5000);
  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBeNull();
  expect(findRetryAfterMs(404, headers, 1_000_000_000_000)).toBeNull();
});

test('it uses the first value of a Retry-After list', () => {
  expect(findRetryAfterMs(429, { 'retry-after': ['9', '1'] }, 1_000_000_000_000)).toBe(9000);
});

test('it reads a spent rate limit reset on a 200', () => {
  const headers = {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000045',
  };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBe(45_000);
});

test('it rounds a fractional reset up', () => {
  const headers = {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000000.0004',
  };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBe(1);
});

test('it reads a reset already past as 0', () => {
  const headers = {
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '999999990',
  };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBe(0);
});

test('it ignores a reset while requests remain', () => {
  const headers = {
    'x-ratelimit-remaining': '3',
    'x-ratelimit-reset': '1000000045',
  };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBeNull();
});

test('it returns the longer wait when Retry-After is longer', () => {
  const headers = {
    'retry-after': '90',
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000010',
  };

  expect(findRetryAfterMs(429, headers, 1_000_000_000_000)).toBe(90_000);
});

test('it returns the longer wait when the reset is longer', () => {
  const headers = {
    'retry-after': '10',
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000060',
  };

  expect(findRetryAfterMs(429, headers, 1_000_000_000_000)).toBe(60_000);
});

test('it gives null for a Retry-After or a reset that does not parse', () => {
  expect(findRetryAfterMs(429, { 'retry-after': 'soon' }, 1_000_000_000_000)).toBeNull();

  const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': 'tomorrow' };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBeNull();
});

test('it falls back to the reset when Retry-After does not parse', () => {
  const headers = {
    'retry-after': 'soon',
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000020',
  };

  expect(findRetryAfterMs(429, headers, 1_000_000_000_000)).toBe(20_000);
});

test.each(['-5', '1.5', 'Tue Jan 2 2026'])(
  'it gives no wait for the Retry-After value %s',
  (value) => {
    expect(findRetryAfterMs(429, { 'retry-after': value }, 1_000_000_000_000)).toBeNull();
  },
);

test('it reads an all-digit Retry-After as seconds', () => {
  expect(findRetryAfterMs(429, { 'retry-after': '2026' }, 1_000_000_000_000)).toBe(2_026_000);
});

test('it gives null with neither header', () => {
  expect(findRetryAfterMs(429, {}, 1_000_000_000_000)).toBeNull();
});

test("it ignores a wait too large to count and keeps the other header's wait", () => {
  const headers = {
    'retry-after': '9'.repeat(309),
    'x-ratelimit-remaining': '0',
    'x-ratelimit-reset': '1000000060',
  };

  expect(findRetryAfterMs(429, headers, 1_000_000_000_000)).toBe(60_000);
});

test('it gives null for a reset too large to count', () => {
  const headers = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '9'.repeat(309) };

  expect(findRetryAfterMs(200, headers, 1_000_000_000_000)).toBeNull();
});
