import type { CallBudget } from '../create-call-budget';

export interface GatewayBudgetOptions {
  // what the task run has left when the step begins
  readonly leftDollars: number;

  // sets the sandbox's limit to the count it began the step with plus the dollars left; false when
  // the gateway did not take it
  readonly setLeftDollars: (leftDollars: number) => Promise<boolean>;

  // reads the sandbox's count after a worker run ended, which records it
  readonly readWorkerEnd: () => Promise<void>;
}

// The gateway's limit stops the turn, so the budget prices no call and never aborts. A worker run's
// planned dollars come off the limit while it goes, and what it charged stays off after it ends.
export function createGatewayBudget(options: GatewayBudgetOptions): CallBudget {
  const never = new AbortController();

  let chargedDollars = 0;
  let plannedDollars = 0;
  const getLeftDollars = () => Math.max(0, options.leftDollars - chargedDollars - plannedDollars);

  return {
    onCall: () => Promise.resolve(),
    signal: never.signal,
    onSpend: () => {},
    getSpentDollars: () => 0,
    getLeftDollars,
    onWorkerStart: async (planned) => {
      plannedDollars += planned;

      const isTaken = await options.setLeftDollars(getLeftDollars());

      if (!isTaken) {
        plannedDollars -= planned;
      }

      return isTaken;
    },
    onWorkerEnd: async (worker) => {
      plannedDollars -= worker.plannedDollars;
      chargedDollars += worker.chargedDollars;

      await options.readWorkerEnd();
      await options.setLeftDollars(getLeftDollars());
    },
  };
}
