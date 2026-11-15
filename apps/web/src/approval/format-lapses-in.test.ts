import { expect, test } from 'bun:test';
import { formatLapsesIn } from './format-lapses-in';

function setupTest() {
  return {
    now: new Date('2026-11-16T01:00:00Z'),
  };
}

test.each([
  ['30 seconds', 30_000, 'Lapses in less than a minute'],
  ['a minute', 60_000, 'Lapses in 1 minute'],
  ['45 minutes', 45 * 60_000, 'Lapses in 45 minutes'],
  ['an hour', 60 * 60_000, 'Lapses in 1 hour'],
  ['47 hours', 47 * 60 * 60_000, 'Lapses in 47 hours'],
  ['3 days', 3 * 24 * 60 * 60_000, 'Lapses in 3 days'],
  ['already past', -60_000, 'Lapses in less than a minute'],
])('it words a lapse in %s', (_name, aheadMs, text) => {
  const ctx = setupTest();

  const lapsesAt = new Date(ctx.now.getTime() + aheadMs);

  expect(formatLapsesIn(lapsesAt, ctx.now)).toBe(text);
});
