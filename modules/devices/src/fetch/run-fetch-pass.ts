import { readDevices } from '../device/read-devices';
import { readLayout } from '../layout/read-layout';
import type { Device, RegionView } from '../types';
import { buildRegionKeys } from './build-region-keys';
import { removeGoneFetches } from './remove-gone-fetches';
import { runRegionFetches } from './run-region-fetches';
import type { FetchSchedule, PageFetchesOptions, RegionTarget } from './types';

// how long the runner waits when no fetch is due
const idleMs = 60_000;

// the wait after a pass that failed, so a fault never spins
const failureWaitMs = 30_000;

// One look at every device: runs each fetch that is due on a device that is online with its screen
// on, and drops the schedule and the held bodies of content that is gone. A device that is offline
// or has its screen off keeps its schedules. It returns the wait until the next fetch is due.
export async function runFetchPass(
  options: PageFetchesOptions,
  schedules: Map<string, FetchSchedule>,
): Promise<number> {
  try {
    const seen = new Set<string>();

    const dueTimes: number[] = [];

    for (const device of await readDevices(options.log.writer.db)) {
      dueTimes.push(...(await runDeviceFetches(options, { schedules, seen }, device)));
    }

    for (const key of schedules.keys()) {
      if (!seen.has(key)) {
        schedules.delete(key);
      }
    }

    await removeGoneFetches(options);

    return dueTimes.length === 0
      ? idleMs
      : Math.min(idleMs, Math.max(0, Math.min(...dueTimes) - options.clock.now()));
  } catch (error) {
    options.onFailure(error);

    return failureWaitMs;
  }
}

interface PassState {
  readonly schedules: Map<string, FetchSchedule>;
  readonly seen: Set<string>;
}

// Runs the due fetches of one device that is online with its screen on, or only marks the fetches
// of any other device as live. Returns the time each region's next fetch is due.
async function runDeviceFetches(
  options: PageFetchesOptions,
  state: PassState,
  device: Device,
): Promise<number[]> {
  const isActive = device.capabilities.screen && options.streams.isOnline(device.deviceID);

  const layout = await readLayout(options.log, device.deviceID, options.clock.now());

  const targets = collectRegionTargets(device.deviceID, layout?.regions ?? []);
  const dueTimes: number[] = [];

  for (const target of targets) {
    if (isActive) {
      const due = await runRegionFetches(options, state.schedules, state.seen, target);

      if (due !== null) {
        dueTimes.push(due);
      }
    } else {
      markSeen(state.seen, target);
    }
  }

  return dueTimes;
}

function collectRegionTargets(deviceID: string, regions: readonly RegionView[]): RegionTarget[] {
  return regions.flatMap((region) => {
    const content = region.shown?.content;

    if (region.shown === null || content?.kind !== 'html' || content.fetches === undefined) {
      return [];
    }

    return [{ deviceID, region: region.name, shown: region.shown, fetches: content.fetches }];
  });
}

function markSeen(seen: Set<string>, target: RegionTarget): void {
  for (const key of buildRegionKeys(target)) {
    seen.add(key);
  }
}
