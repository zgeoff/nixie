import type { ModelPrices } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import type { ToolStepHold } from '@heynixie/tools';
import type { ModelCallUsage } from '@heynixie/wire';

export interface CallBudget {
  readonly onCall: (usage: ModelCallUsage) => Promise<void>;

  // aborts once the priced calls reach the dollars left
  readonly signal: AbortSignal;

  // adds the dollars a worker run that the turn started spent, and aborts the signal once the
  // dollars left are reached
  readonly onSpend: (dollars: number) => void;

  // the turn's own spend, which leaves out the spend of its workers, which their own records count
  readonly getSpentDollars: () => number;

  // what the turn may still spend, counting its calls and its workers' spend
  readonly getLeftDollars: () => number;

  // set by a budget that a meter keeps: the start and the end of a worker run
  readonly onWorkerStart?: ToolStepHold['onWorkerStart'];
  readonly onWorkerEnd?: ToolStepHold['onWorkerEnd'];
}

export function createCallBudget(prices: ModelPrices, leftDollars: number): CallBudget {
  const reached = new AbortController();

  let spentDollars = 0;
  let workerDollars = 0;
  const getLeftDollars = () => Math.max(0, leftDollars - spentDollars - workerDollars);

  return {
    onCall: (usage) => {
      spentDollars += buildCallCost(usage, prices);

      if (spentDollars + workerDollars >= leftDollars) {
        reached.abort();
      }

      return Promise.resolve();
    },
    onSpend: (dollars) => {
      workerDollars += dollars;

      if (spentDollars + workerDollars >= leftDollars) {
        reached.abort();
      }
    },
    signal: reached.signal,
    getSpentDollars: () => spentDollars,
    getLeftDollars,
  };
}
