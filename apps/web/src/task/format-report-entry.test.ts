import { expect, test } from 'bun:test';
import { formatReportEntry } from './format-report-entry';

test('it words a skipped fire with its reason', () => {
  expect(
    formatReportEntry({
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      kind: 'skipped',
      scheduledFor: '2026-11-13T08:00:00.000Z',
      firedAt: null,
      lateBySeconds: null,
      reason: 'task_held',
      sequence: 8044,
    }),
  ).toBe(
    'Water the tomatoes: skipped, because its task was held (scheduled for 2026-11-13T08:00:00.000Z)',
  );
});

test('it words a late fire with how late it came', () => {
  expect(
    formatReportEntry({
      definitionID: 'water-the-tomatoes',
      name: 'Water the tomatoes',
      kind: 'late',
      scheduledFor: '2026-11-13T08:00:00.000Z',
      firedAt: '2026-11-13T08:45:00.000Z',
      lateBySeconds: 2700,
      reason: null,
      sequence: 8050,
    }),
  ).toBe(
    'Water the tomatoes: fired late, 45 minutes late (scheduled for 2026-11-13T08:00:00.000Z)',
  );
});
