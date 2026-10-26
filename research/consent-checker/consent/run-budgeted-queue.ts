// The failure of an answer that held no output, such as a call the model API refused. Its record
// keeps the call's cost, so the spend stays right, and a rerun runs the item again.
export const noOutputFailure = 'no_output';

// The reason a record with no answer gives when the query returned an answer with nothing in it.
export const emptyAnswerReason = 'the answer held no output';

export interface QueueOutput {
  costUSD: number;
  failure: string | null;
  failureReason?: string;
}

export interface BudgetedQueue<Item, Output extends QueueOutput> {
  items: readonly Item[];
  appendOutput: (output: Output) => Promise<void>;
  spentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runItem: (item: Item) => Promise<Output>;
}

export interface QueueResult {
  ran: number;
  costUSD: number;
  isStoppedAtBudget: boolean;
  isStoppedByFailure: boolean;
  failureReason?: string;
}

// Runs each item and appends its output. No item starts once the spend reaches the budget or the run
// reaches its limit, so the spend passes the budget by at most the items in flight. An output with
// no answer stops the run.
export async function runBudgetedQueue<Item, Output extends QueueOutput>(
  queue: BudgetedQueue<Item, Output>,
): Promise<QueueResult> {
  const pending = [...queue.items];

  const result: QueueResult = {
    ran: 0,
    costUSD: queue.spentUSD,
    isStoppedAtBudget: false,
    isStoppedByFailure: false,
  };

  let started = 0;
  let hasErrored = false;

  const runWorker = async (): Promise<void> => {
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      if (
        hasErrored ||
        result.isStoppedByFailure ||
        (queue.limit !== null && started >= queue.limit)
      ) {
        return;
      }

      if (result.costUSD >= queue.budgetUSD) {
        result.isStoppedAtBudget = true;

        return;
      }

      started += 1;

      const output = await queue.runItem(next);

      result.costUSD += output.costUSD;

      await queue.appendOutput(output);

      if (output.failure === noOutputFailure) {
        result.isStoppedByFailure = true;

        if (output.failureReason !== undefined) {
          result.failureReason = output.failureReason;
        }

        return;
      }

      result.ran += 1;
    }
  };

  // A worker that throws leaves the others running paid calls, so the run waits for each of them to
  // append its output before the caller releases the run files.
  const settled = await Promise.allSettled(
    Array.from({ length: queue.concurrency }, async () => {
      try {
        await runWorker();
      } catch (error) {
        hasErrored = true;

        throw error;
      }
    }),
  );

  const rejection = settled.find((outcome) => outcome.status === 'rejected');

  if (rejection !== undefined) {
    throw rejection.reason;
  }

  return result;
}
