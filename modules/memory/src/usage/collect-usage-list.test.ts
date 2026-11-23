import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildIndexRows } from '../test-utils/build-index-rows';
import { collectUsageList } from './collect-usage-list';

function setupTest() {
  const [first, second, third, fourth] = buildIndexRows('home', 4);

  invariant(first && second && third && fourth);

  const nowMs = Date.parse('2026-11-23T12:00:00Z');
  const dayMs = 86_400_000;

  return {
    first,
    second,
    third,
    fourth,
    nowMs,
    surfaced: (daysAgo: number) => ({
      searched: 0,
      pushed: 1,
      lastSurfacedAtMs: nowMs - daysAgo * dayMs,
      lastRecalledByIDAtMs: null,
    }),
  };
}

test('it lists the never-surfaced first, then the longest unsurfaced, with the older item first on a tie', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.fourth, ctx.third, ctx.second, ctx.first],
      triggers: new Map(),
      usage: {
        items: new Map([
          [ctx.first.itemID, ctx.surfaced(20)],
          [ctx.second.itemID, ctx.surfaced(40)],
        ]),
        earliestAtMs: null,
      },
      savedTimes: new Map(),
    },
    10,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.itemID)).toStrictEqual([
    ctx.third.shortID,
    ctx.fourth.shortID,
    ctx.second.shortID,
    ctx.first.shortID,
  ]);
});

test('it leaves out an item that surfaced inside the period', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.first, ctx.second],
      triggers: new Map(),
      usage: { items: new Map([[ctx.first.itemID, ctx.surfaced(3)]]), earliestAtMs: null },
      savedTimes: new Map(),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.itemID)).toStrictEqual([ctx.second.shortID]);
});

test('it lists the trigger phrases only of an item that no push placed', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.first, ctx.second],
      triggers: new Map([
        [ctx.first.itemID, ['boiler service']],
        [ctx.second.itemID, ['piano tuning']],
      ]),
      usage: { items: new Map([[ctx.first.itemID, ctx.surfaced(30)]]), earliestAtMs: null },
      savedTimes: new Map(),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.neverFiredTriggers)).toStrictEqual([['piano tuning'], []]);
});
