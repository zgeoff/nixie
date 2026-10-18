import type { Clock } from '@heynixie/clock';
import { checkParts } from './check-parts';
import type { PartCheck, PartReport } from './types';

export interface PartRefreshOptions<Part extends string> {
  // the checks too slow to run on each health request, such as a call to another service
  readonly checks: Readonly<Record<Part, PartCheck>>;
  readonly clock: Clock;

  // the wait between the end of one round of checks and the start of the next. A part that fails
  // shows up to this wait plus two timeouts later: the round in flight ends, then the next one runs.
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

// Runs the checks at once and then every interval, keeping each part's last report for health
// requests. A check past its timeout sees its signal abort, ends its calls and runs again next round;
// a round skips a part whose check ignores the signal and still runs, so calls never stack up.
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
  const running = new Set<string>();

  while (!signal.aborted) {
    const idle = Object.entries<PartCheck>(options.checks)
      .filter(([part]) => !running.has(part))
      .map(([part, check]) => [part, makeTrackedCheck(part, check, running)] as const);

    const report = await checkParts(Object.fromEntries(idle), options.timeoutMs, options.clock);

    for (const [part, partReport] of Object.entries(report.parts)) {
      reports.set(part, partReport);
    }

    await options.clock.sleep(options.intervalMs, signal);
  }
}

// a check that marks its part running until the check resolves or rejects, after its timeout too
function makeTrackedCheck(part: string, check: PartCheck, running: Set<string>): PartCheck {
  return async (signal) => {
    running.add(part);

    try {
      return await check(signal);
    } finally {
      running.delete(part);
    }
  };
}
