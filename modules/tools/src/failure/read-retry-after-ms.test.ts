import { expect, test } from 'bun:test';
import { readRetryAfterMs } from './read-retry-after-ms';

test.each([
  [{ 'retry-after': '7' }, 7000],
  [{ 'retry-after': ' 0 ' }, 0],
  [{ 'retry-after': '9999999999999' }, 86_400_000],
  [{ 'retry-after': 'Mon, 23 Nov 2026 09:00:07 GMT', date: 'Mon, 23 Nov 2026 09:00:00 GMT' }, 7000],
  [{ 'retry-after': 'Mon, 23 Nov 2026 08:59:00 GMT', date: 'Mon, 23 Nov 2026 09:00:00 GMT' }, 0],
  [{ 'retry-after': 'Mon, 23 Nov 2026 09:00:07 GMT' }, null],
  [{ 'retry-after': 'soon', date: 'Mon, 23 Nov 2026 09:00:00 GMT' }, null],
  [{ 'retry-after': '-5', date: 'Mon, 23 Nov 2026 09:00:00 GMT' }, null],
  [{ 'retry-after': '' }, null],
  [{}, null],
])('#readRetryAfterMs reads %j as %p', (headers, expected) => {
  expect(readRetryAfterMs(new Headers(headers))).toBe(expected);
});
