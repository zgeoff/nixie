import { expect, test } from 'bun:test';
import { getPeriodStart } from './get-period-start';

test('#getPeriodStart starts a day on itself', () => {
  expect(getPeriodStart('day', '2026-11-17')).toBe('2026-11-17');
});

test('#getPeriodStart starts a month on its first day', () => {
  expect(getPeriodStart('month', '2026-11-17')).toBe('2026-11-01');
});
