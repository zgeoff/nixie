import { readDevices } from '../device/read-devices';
import { readLayout } from '../layout/read-layout';
import { runRegionFetches } from './run-region-fetches';
import type { FetchSchedule, PageFetchesOptions } from './types';

// how long the runner waits when no fetch is due
const idleMs = 60_000;

// the wait after a pass that failed, so a fault never spins
const failureWaitMs = 30_000;

// One look at every online device whose screen is on: starts each fetch that is new, runs each that
// is due, and drops the schedule of content that is gone. It returns the wait until the next fetch
// is due.
export async function runFetchPass(
  options: PageFetchesOptions,
  schedules: Map<string, FetchSchedule>,
): Promise<number> {
  try {
    const seen = new Set<string>();

    const dueTimes: number[] = [];

    for (const device of await readDevices(options.log.writer.db)) {
      if (!device.capabilities.screen || !options.streams.isOnline(device.deviceID)) {
        continue;
      }

      const layout = await readLayout(options.log, device.deviceID, options.clock.now());

      for (const region of layout?.regions ?? []) {
        const content = region.shown?.content;

        if (region.shown === null || content?.kind !== 'html' || content.fetches === undefined) {
          continue;
        }

        const due = await runRegionFetches(options, schedules, seen, {
          deviceID: device.deviceID,
          region: region.name,
          shown: region.shown,
          fetches: content.fetches,
        });

        if (due !== null) {
          dueTimes.push(due);
        }
      }
    }

    for (const key of schedules.keys()) {
      if (!seen.has(key)) {
        schedules.delete(key);
      }
    }

    return dueTimes.length === 0
      ? idleMs
      : Math.min(idleMs, Math.max(0, Math.min(...dueTimes) - options.clock.now()));
  } catch (error) {
    options.onFailure(error);

    return failureWaitMs;
  }
}
