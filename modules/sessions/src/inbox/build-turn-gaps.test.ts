import { expect, test } from 'bun:test';
import { buildTurnGaps } from './build-turn-gaps';

test('it measures each gap from its own start', () => {
  expect(
    buildTurnGaps({
      startedAtMs: 10_000_000,
      lastTurnEndedAtMs: 10_000_000 - 3_120_000,
      ownerGapEndsAtMs: 9_990_000,
      ownerLastWroteAtMs: 9_990_000 - 40_000,
    }),
  ).toStrictEqual({ sinceYourLastTurn: '52 min', sinceOwnerLastWrote: '40 s' });
});

test('it leaves out the gap since the last turn on the first turn', () => {
  expect(
    buildTurnGaps({
      startedAtMs: 5000,
      lastTurnEndedAtMs: null,
      ownerGapEndsAtMs: 5000,
      ownerLastWroteAtMs: 1000,
    }),
  ).toStrictEqual({ sinceYourLastTurn: null, sinceOwnerLastWrote: '4 s' });
});

test('it leaves out the gap since the owner wrote when the owner never has', () => {
  expect(
    buildTurnGaps({
      startedAtMs: 5000,
      lastTurnEndedAtMs: 2000,
      ownerGapEndsAtMs: 5000,
      ownerLastWroteAtMs: null,
    }),
  ).toStrictEqual({ sinceYourLastTurn: '3 s', sinceOwnerLastWrote: null });
});
