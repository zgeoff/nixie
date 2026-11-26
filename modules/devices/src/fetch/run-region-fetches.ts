import { buildFetchKey } from './build-fetch-key';
import { probeFetchShown } from './probe-fetch-shown';
import { runDeclaredFetch } from './run-declared-fetch';
import type { FetchOutcome, FetchSchedule, PageFetchesOptions, RegionTarget } from './types';

// Runs the fetches of one page region that are due, and returns when the next one is due, or null.
// Only the first fetch of a page that this process's call showed skips the rules' decision. Each
// fetch first checks that the region still shows the page.
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
    const key = buildFetchKey(target.deviceID, target.region, shownID, fetch.url);

    seen.add(key);

    const schedule = schedules.get(key) ?? { nextAtMs: options.clock.now(), hasRun: false };

    schedules.set(key, schedule);

    if (schedule.nextAtMs !== null && schedule.nextAtMs <= options.clock.now()) {
      const fetchTarget = {
        deviceID: target.deviceID,
        region: target.region,
        shown: shownID,
        callSequence: target.shown.callSequence ?? null,
        url: fetch.url,
      };

      const isShown = await probeFetchShown(options, fetchTarget);

      if (!isShown) {
        return null;
      }

      const outcome = await runDeclaredFetch(options, fetchTarget, schedule.hasRun || !isCovered);

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
