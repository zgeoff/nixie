import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildIndexRows } from '../test-utils/build-index-rows';
import { buildTriggerKey } from '../utils/build-trigger-key';
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
    dayMs,
    unkeyed: (daysAgo: number) => ({
      searched: 0,
      pushed: 1,
      lastSurfacedAtMs: nowMs - daysAgo * dayMs,
      lastRecalledByIDAtMs: null,
      firedTriggers: [],
      lastUnkeyedPushAtMs: nowMs - daysAgo * dayMs,
    }),
    addedTimes: (itemID: string, daysAgoByPhrase: Readonly<Record<string, number>>) => {
      const times = Object.entries(daysAgoByPhrase).map(
        ([phrase, daysAgo]) => [buildTriggerKey(phrase), nowMs - daysAgo * dayMs] as const,
      );

      return new Map([[itemID, new Map(times)]]);
    },
    surfaced: (daysAgo: number) => ({
      searched: 0,
      pushed: 1,
      lastSurfacedAtMs: nowMs - daysAgo * dayMs,
      lastRecalledByIDAtMs: null,
      firedTriggers: [],
      lastUnkeyedPushAtMs: null,
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
      phraseAddedTimes: new Map(),
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
      phraseAddedTimes: new Map(),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.itemID)).toStrictEqual([ctx.second.shortID]);
});

test('it lists the trigger phrases that no push named, one by one', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.first],
      triggers: new Map([[ctx.first.itemID, ['boiler service', 'radiator bleed']]]),
      usage: {
        items: new Map([
          [
            ctx.first.itemID,
            { ...ctx.surfaced(30), firedTriggers: [buildTriggerKey('boiler service')] },
          ],
        ]),
        earliestAtMs: null,
      },
      savedTimes: new Map(),
      phraseAddedTimes: new Map(),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.neverFiredTriggers)).toStrictEqual([['radiator bleed']]);
});

test('it lists every phrase of an item that no push placed, and none for a push that named no phrase', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.first, ctx.second],
      triggers: new Map([
        [ctx.first.itemID, ['boiler service']],
        [ctx.second.itemID, ['piano tuning']],
      ]),
      usage: {
        items: new Map([[ctx.first.itemID, ctx.unkeyed(30)]]),
        earliestAtMs: null,
      },
      savedTimes: new Map(),
      phraseAddedTimes: ctx.addedTimes(ctx.first.itemID, { 'boiler service': 60 }),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.neverFiredTriggers)).toStrictEqual([['piano tuning'], []]);
});

test('it lists a phrase added after the newest push that named no phrase', () => {
  const ctx = setupTest();

  const entries = collectUsageList(
    {
      rows: [ctx.first],
      triggers: new Map([[ctx.first.itemID, ['boiler service', 'radiator bleed']]]),
      usage: {
        items: new Map([[ctx.first.itemID, ctx.unkeyed(30)]]),
        earliestAtMs: null,
      },
      savedTimes: new Map(),
      phraseAddedTimes: ctx.addedTimes(ctx.first.itemID, {
        'boiler service': 60,
        'radiator bleed': 10,
      }),
    },
    7,
    ctx.nowMs,
  );

  expect(entries.map((entry) => entry.neverFiredTriggers)).toStrictEqual([['radiator bleed']]);
});
