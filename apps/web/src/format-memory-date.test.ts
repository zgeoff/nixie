import { expect, test } from 'bun:test';
import { formatMemoryDate } from './format-memory-date';
import { setupBrowserTimeZone } from './test-utils/setup-browser-time-zone';

test('it formats the date in the browser time zone', () => {
  setupBrowserTimeZone('Pacific/Auckland');

  expect(formatMemoryDate(new Date('2026-02-28T20:00:00Z'))).toBe('Mar 1, 2026');
});
