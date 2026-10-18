import type { Clock } from '@heynixie/clock';
import { checkParts } from './check-parts';
import type { PartCheck, PartReport } from './types';

export interface PartRefreshOptions<Part extends string> {
  // the checks too slow to run on each health request, such as a call to another service
  readonly checks: Readonly<Record<Part, PartCheck>>;
  readonly clock: Clock;

  // the wait between the end of one round of checks and the start of the next
  readonly intervalMs: number;

  // the longest one part's check runs before the part reports unready
  readonly timeoutMs: number;
}

export interface PartRefresh<Part extends string> {
  // the part's last report, unready until its first check ends
  readonly read: (part: Part) => PartReport;

  // ends the refresh, after the round in flight if one runs
  readonly stop: () => Promise<void>;
}

// Runs the checks at once and then every interval, and keeps each part's last report, so a health
// request reads the report and never waits on a slow check. Each round ends before the next starts,
// so a slow part never stacks up calls.
export function startPartRefresh<Part extends string>(
  options: PartRefreshOptions<Part>,
): PartRefresh<Part> {
  const stopping = new AbortController();
  const reports = new Map<string, PartReport>();

  const loop = runRefresh(options, reports, stopping.signal);

  return {
    read: (part) => reports.get(part) ?? notCheckedReport,
    stop: async () => {
      stopping.abort();

      await loop;
    },
  };
}

const notCheckedReport: PartReport = { isReady: false, reason: 'the part is not checked yet' };

async function runRefresh<Part extends string>(
  options: PartRefreshOptions<Part>,
  reports: Map<string, PartReport>,
  signal: AbortSignal,
): Promise<void> {
  while (!signal.aborted) {
    const report = await checkParts(options.checks, options.timeoutMs, options.clock);

    for (const [part, partReport] of Object.entries(report.parts)) {
      reports.set(part, partReport);
    }

    await options.clock.sleep(options.intervalMs, signal);
  }
}
