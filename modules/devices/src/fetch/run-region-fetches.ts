import type { RegionContent } from '@heynixie/contract';
import type { ShownRegion } from '../types';
import { runDeclaredFetch } from './run-declared-fetch';
import type { FetchOutcome, FetchSchedule, PageFetchesOptions } from './types';

interface RegionTarget {
  readonly deviceID: string;
  readonly region: string;
  readonly shown: ShownRegion;
  readonly fetches: NonNullable<Extract<RegionContent, { kind: 'html' }>['fetches']>;
}

// Runs the fetches of one page region that are due, and returns when the next one is due, or null.
// The first fetch of a page that this process's call showed needs no new decision of the rules.
// Every other fetch asks the rules first, as does each fetch of a page that a restart brought back.
export async function runRegionFetches(
  options: PageFetchesOptions,
  schedules: Map<string, FetchSchedule>,
  seen: Set<string>,
  target: RegionTarget,
): Promise<number | null> {
  const shownID = target.shown.shownID;
  const held = options.streams.fetches.readHeld(target.deviceID, target.region);
  const isCovered = held?.shown === shownID && held.isCovered;

  if (held?.shown !== shownID) {
    const declared = target.fetches.map((fetch) => ({
      url: fetch.url,
      refreshMinutes: fetch.refreshMinutes,
    }));

    options.streams.fetches.declare(
      { deviceID: target.deviceID, region: target.region },
      { shown: shownID, fetches: declared, isCovered: false },
    );
  }

  const dueTimes: number[] = [];

  for (const fetch of target.fetches) {
    const key = [target.deviceID, target.region, shownID, fetch.url].join('\0');

    seen.add(key);

    const schedule = schedules.get(key) ?? { nextAtMs: options.clock.now(), hasRun: false };

    schedules.set(key, schedule);

    if (schedule.nextAtMs !== null && schedule.nextAtMs <= options.clock.now()) {
      const outcome = await runDeclaredFetch(
        options,
        {
          deviceID: target.deviceID,
          region: target.region,
          shown: shownID,
          callSequence: target.shown.callSequence ?? null,
          url: fetch.url,
        },
        schedule.hasRun || !isCovered,
      );

      schedule.hasRun ||= outcome.kind !== 'paused';
      schedule.nextAtMs = pickNextAtMs(options.clock.now(), outcome, fetch.refreshMinutes);
    }

    if (schedule.nextAtMs !== null) {
      dueTimes.push(schedule.nextAtMs);
    }
  }

  return dueTimes.length === 0 ? null : Math.min(...dueTimes);
}

function pickNextAtMs(
  nowMs: number,
  outcome: FetchOutcome,
  refreshMinutes: number | undefined,
): number | null {
  if (outcome.kind === 'paused') {
    return nowMs + outcome.leftMs;
  }

  if (outcome.kind === 'refused' || refreshMinutes === undefined) {
    return null;
  }

  return nowMs + refreshMinutes * 60_000;
}
