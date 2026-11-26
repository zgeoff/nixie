import type { ModelPrices } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import type { ModelCallUsage } from '@heynixie/wire';

export interface CallBudget {
  // rejects when the read of late spend fails, which fails the turn
  readonly onCall: (usage: ModelCallUsage) => Promise<void>;

  // aborts once the priced calls and the late spend reach the dollars left
  readonly signal: AbortSignal;

  // adds the dollars a worker run that the turn started spent, and aborts the signal once the
  // dollars left are reached
  readonly onSpend: (dollars: number) => void;

  // the turn's own spend, which leaves out the late spend that its record would count twice, and
  // the spend of its workers, which their own records count
  readonly getSpentDollars: () => number;

  // what the turn may still spend, counting its calls, the late spend and its workers' spend
  readonly getLeftDollars: () => number;
}

export function createCallBudget(
  prices: ModelPrices,
  leftDollars: number,
  readLateDollars: () => Promise<number>,
): CallBudget {
  const reached = new AbortController();

  let spentDollars = 0;
  let lateDollars = 0;
  let workerDollars = 0;

  const getLeftDollars = () =>
    Math.max(0, leftDollars - spentDollars - lateDollars - workerDollars);

  return {
    onCall: async (usage) => {
      // The cost goes in first, so a failed read still leaves the call in the turn's spend.
      spentDollars += buildCallCost(usage, prices);

      // Late spend only lowers the budget, so a smaller read never raises it again.
      const readDollars = await readLateDollars();

      lateDollars = Math.max(lateDollars, readDollars);

      if (spentDollars + lateDollars + workerDollars >= leftDollars) {
        reached.abort();
      }
    },
    onSpend: (dollars) => {
      workerDollars += dollars;

      if (spentDollars + lateDollars + workerDollars >= leftDollars) {
        reached.abort();
      }
    },
    signal: reached.signal,
    getSpentDollars: () => spentDollars,
    getLeftDollars,
  };
}
