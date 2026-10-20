import { createActor, toPromise } from 'xstate';
import type { PartRefreshOptions } from './part-refresh-machine';
import { partRefreshMachine } from './part-refresh-machine';
import type { PartReport } from './types';

export type { PartRefreshOptions } from './part-refresh-machine';

export interface PartRefresh<Part extends string> {
  // the part's last report, unready until its first check ends
  readonly read: (part: Part) => PartReport;

  // ends the refresh, after the round in flight if one runs
  readonly stop: () => Promise<void>;
}

const notCheckedReport: PartReport = { isReady: false, reason: 'the part is not checked yet' };

// Runs the checks at once and then every interval, keeping each part's last report for health
// requests. A check past its timeout sees its signal abort, ends its calls and runs again next round;
// a round skips a part whose check ignores the signal and still runs, so calls never stack up.
export function startPartRefresh<Part extends string>(
  options: PartRefreshOptions<Part>,
): PartRefresh<Part> {
  const refresh = createActor(partRefreshMachine, { input: options });

  refresh.start();

  return {
    read: (part) => refresh.getSnapshot().context.reports.get(part) ?? notCheckedReport,
    stop: async () => {
      if (refresh.getSnapshot().status === 'active') {
        refresh.send({ type: 'stop' });
      }

      await toPromise(refresh);
    },
  };
}
