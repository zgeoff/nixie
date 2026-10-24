import { expect, test } from 'bun:test';
import { planPlayback } from './plan-playback.ts';

test('it plays clips back to back when each is ready before the one before it ends', () => {
  expect(
    planPlayback(
      [
        { audioMs: 500, readyAt: 1000 },
        { audioMs: 300, readyAt: 1200 },
        { audioMs: 400, readyAt: 1700 },
      ],
      0,
    ),
  ).toStrictEqual({ gapMs: 0, gaps: 0, playEndAt: 2200, startsAt: [1000, 1500, 1800] });
});

test('it counts a gap when a clip is ready after the one before it ends', () => {
  expect(
    planPlayback(
      [
        { audioMs: 500, readyAt: 1000 },
        { audioMs: 300, readyAt: 1800 },
      ],
      0,
    ),
  ).toStrictEqual({ gapMs: 300, gaps: 1, playEndAt: 2100, startsAt: [1000, 1800] });
});

test('it counts no gap for a wait at or under the tolerance', () => {
  expect(
    planPlayback(
      [
        { audioMs: 500, readyAt: 1000 },
        { audioMs: 300, readyAt: 1650 },
        { audioMs: 200, readyAt: 2100 },
      ],
      150,
    ),
  ).toStrictEqual({ gapMs: 0, gaps: 0, playEndAt: 2300, startsAt: [1000, 1650, 2100] });
});

test('it plays nothing for a reply with no clips', () => {
  expect(planPlayback([], 0)).toStrictEqual({ gapMs: 0, gaps: 0, playEndAt: 0, startsAt: [] });
});
