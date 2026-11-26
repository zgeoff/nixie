import type { CallBudget } from '../create-call-budget';

export interface GatewayBudgetOptions {
  // what the task run has left when the step begins
  readonly leftDollars: number;

  // the sandbox's count when the step began, in whole micros
  readonly startMicros: number;

  // the sandbox's count now in whole micros, or null when the gateway did not answer
  readonly readCountMicros: () => Promise<number | null>;

  // sets the sandbox's limit to the count it began the step with plus the dollars left; false when
  // the gateway did not take it
  readonly setLeftDollars: (leftDollars: number) => Promise<boolean>;

  // reads the sandbox's count after a worker run ended, which records it
  readonly readWorkerEnd: () => Promise<void>;
}

// The gateway's limit stops the turn, so the budget prices no call and never aborts. A worker run's
// dollars come off the limit while it goes, and what it charged stays off after it ends. A worker
// run gets what the sandbox has left when it asks, and each change of the limit goes out in turn.
export function createGatewayBudget(options: GatewayBudgetOptions): CallBudget {
  const never = new AbortController();

  let chargedDollars = 0;
  let plannedDollars = 0;
  let queue: Promise<void> = Promise.resolve();
  const getLeftDollars = () => Math.max(0, options.leftDollars - chargedDollars - plannedDollars);

  const enqueue = async <Result>(job: () => Promise<Result>): Promise<Result> => {
    const previous = queue;
    const done = Promise.withResolvers<void>();

    queue = done.promise;

    await previous;

    try {
      return await job();
    } finally {
      done.resolve();
    }
  };

  return {
    onCall: () => Promise.resolve(),
    signal: never.signal,
    onSpend: () => {},
    getSpentDollars: () => 0,
    getLeftDollars,
    onWorkerStart: (requestedDollars) =>
      enqueue(async () => {
        const countMicros = await options.readCountMicros();

        if (countMicros === null) {
          return 0;
        }

        const spentDollars = (countMicros - options.startMicros) / 1_000_000;
        const grantedDollars = Math.min(requestedDollars, getLeftDollars() - spentDollars);

        if (grantedDollars <= 0) {
          return 0;
        }

        plannedDollars += grantedDollars;

        const isTaken = await options.setLeftDollars(getLeftDollars());

        if (!isTaken) {
          plannedDollars -= grantedDollars;

          return 0;
        }

        return grantedDollars;
      }),
    onWorkerEnd: (worker) =>
      enqueue(async () => {
        plannedDollars -= worker.plannedDollars;
        chargedDollars += worker.chargedDollars;

        await options.readWorkerEnd();
        await options.setLeftDollars(getLeftDollars());
      }),
  };
}
