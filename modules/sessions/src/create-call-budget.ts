import type { ModelPrices } from '@heynixie/models';
import { buildCallCost } from '@heynixie/models';
import type { ModelCallUsage } from '@heynixie/wire';

export interface CallBudget {
  readonly onCall: (usage: ModelCallUsage) => void;

  // aborts once the priced calls reach the dollars left
  readonly signal: AbortSignal;

  readonly getSpentDollars: () => number;
}

// A profile with no prices prices each call as nothing, so its turns never reach the budget.
export function createCallBudget(prices: ModelPrices | null, leftDollars: number): CallBudget {
  const reached = new AbortController();

  let spentDollars = 0;

  return {
    onCall: (usage) => {
      if (prices === null) {
        return;
      }

      spentDollars += buildCallCost(usage, prices);

      if (spentDollars >= leftDollars) {
        reached.abort();
      }
    },
    signal: reached.signal,
    getSpentDollars: () => spentDollars,
  };
}
