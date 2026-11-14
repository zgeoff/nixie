import type { ModelPrices } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import type { ModelCallUsage } from '@heynixie/wire';

export interface CallBudget {
  // rejects when the read of late spend fails, which fails the turn
  readonly onCall: (usage: ModelCallUsage) => Promise<void>;

  // aborts once the priced calls and the late spend reach the dollars left
  readonly signal: AbortSignal;

  // the turn's own spend, which leaves out the late spend that its record would count twice
  readonly getSpentDollars: () => number;
}

// A profile with no prices prices each call as nothing, so its turns never reach the budget and
// read no late spend.
export function createCallBudget(
  prices: ModelPrices | null,
  leftDollars: number,
  readLateDollars: () => Promise<number>,
): CallBudget {
  const reached = new AbortController();

  let spentDollars = 0;
  let lateDollars = 0;

  return {
    onCall: async (usage) => {
      if (prices === null) {
        return;
      }

      // The cost goes in first, so a failed read still leaves the call in the turn's spend.
      spentDollars += buildCallCost(usage, prices);

      // Late spend only lowers the budget, so a smaller read never raises it again.
      const readDollars = await readLateDollars();

      lateDollars = Math.max(lateDollars, readDollars);

      if (spentDollars + lateDollars >= leftDollars) {
        reached.abort();
      }
    },
    signal: reached.signal,
    getSpentDollars: () => spentDollars,
  };
}
