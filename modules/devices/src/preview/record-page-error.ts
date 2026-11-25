import type { Log } from '@heynixie/log';
import { readLayout } from '../layout/read-layout';
import type { DeviceStreams } from '../stream/create-device-streams';

export interface PageErrorSink {
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly streams: Pick<DeviceStreams, 'errors'>;
}

export interface PageErrorReport {
  readonly region: string;
  readonly shown: string;
  readonly message: string;
}

// Keeps an error that a device reported for a region. The error is stale, and nothing is kept,
// when the region shows other content by now or is not in the device's layout.
export async function recordPageError(
  options: PageErrorSink,
  deviceID: string,
  report: PageErrorReport,
  nowMs: number,
): Promise<'recorded' | 'stale'> {
  const layout = await readLayout(options.log, deviceID, nowMs);

  const region = layout?.regions.find((candidate) => candidate.name === report.region);

  if (region?.shown?.shownID !== report.shown) {
    return 'stale';
  }

  options.streams.errors.record(deviceID, { ...report, atMs: nowMs });

  return 'recorded';
}
