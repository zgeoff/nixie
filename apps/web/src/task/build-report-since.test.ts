import { expect, test } from 'bun:test';
import { buildReportSince } from './build-report-since';

test('it starts the report 7 days before now', () => {
  expect(buildReportSince(new Date(2026, 10, 17, 12, 0, 0))).toBe('2026-11-10');
});

test('it crosses a month and a year boundary', () => {
  expect(buildReportSince(new Date(2027, 0, 3, 12, 0, 0))).toBe('2026-12-27');
});
