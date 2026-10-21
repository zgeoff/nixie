import { createActor, toPromise } from 'xstate';
import type { PartRefreshOptions } from './part-refresh-machine';
import { partRefreshMachine } from './part-refresh-machine';
import type { PartReport } from './types';

export type { PartRefreshOptions } from './part-refresh-machine';

export interface PartRefresh<Part extends string> {
  readonly read: (part: Part) => PartReport;

  readonly stop: () => Promise<void>;
}

const notCheckedReport: PartReport = { isReady: false, reason: 'the part is not checked yet' };

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
