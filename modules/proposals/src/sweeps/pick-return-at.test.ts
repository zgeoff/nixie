import { expect, test } from 'bun:test';
import { pickReturnAt } from './pick-return-at';

test.each<[string, number, { start: string; end: string } | null, number]>([
  [
    'it returns the asked time when no quiet hours are set',
    Date.UTC(2026, 5, 1, 23, 30),
    null,
    Date.UTC(2026, 5, 1, 23, 30),
  ],
  [
    'it returns the asked time outside the quiet hours',
    Date.UTC(2026, 5, 1, 12, 15),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 5, 1, 12, 15),
  ],
  [
    'it moves a time before midnight to the end of the quiet hours',
    Date.UTC(2026, 5, 1, 23, 30),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 5, 2, 7, 0),
  ],
  [
    'it moves a time after midnight to the end of the quiet hours',
    Date.UTC(2026, 5, 2, 3, 10),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 5, 2, 7, 0),
  ],
])('#pickReturnAt %s', (_title, deferUntil, quietHours, expected) => {
  expect(pickReturnAt(deferUntil, quietHours, 'UTC')).toBe(expected);
});

test('#pickReturnAt reads the quiet hours in the given zone', () => {
  const deferUntil = Date.UTC(2026, 0, 5, 13, 30);

  expect(pickReturnAt(deferUntil, { start: '22:00', end: '07:00' }, 'Asia/Tokyo')).toBe(
    Date.UTC(2026, 0, 5, 22, 0),
  );
});
