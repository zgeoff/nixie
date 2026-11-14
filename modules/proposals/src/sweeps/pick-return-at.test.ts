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

test.each<[string, number, { start: string; end: string }, number]>([
  [
    'it ends the quiet hours at the local end time on the night the clocks go back',
    Date.UTC(2026, 10, 1, 4, 30),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 10, 1, 12, 0),
  ],
  [
    'it ends the quiet hours at the local end time on the night the clocks go forward',
    Date.UTC(2026, 2, 8, 5, 30),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 2, 8, 11, 0),
  ],
  [
    'it ends the quiet hours the next local day when the time falls before midnight on a clock change',
    Date.UTC(2026, 10, 1, 3, 30),
    { start: '22:00', end: '07:00' },
    Date.UTC(2026, 10, 1, 12, 0),
  ],
  [
    'it takes the earlier of the 2 instants when the end time repeats as the clocks go back',
    Date.UTC(2026, 10, 1, 4, 0),
    { start: '00:00', end: '01:30' },
    Date.UTC(2026, 10, 1, 5, 30),
  ],
  [
    'it moves an end time the clocks skip to the time the skip lands on',
    Date.UTC(2026, 2, 8, 5, 30),
    { start: '00:00', end: '02:30' },
    Date.UTC(2026, 2, 8, 7, 30),
  ],
])('#pickReturnAt %s in America/New_York', (_title, deferUntil, quietHours, expected) => {
  expect(pickReturnAt(deferUntil, quietHours, 'America/New_York')).toBe(expected);
});
