import { appendFile } from 'node:fs/promises';

export interface BudgetedQueue<Item, Output extends { costUSD: number }> {
  items: readonly Item[];
  outPath: string;
  spentUSD: number;
  budgetUSD: number;
  limit: number | null;
  concurrency: number;
  runItem: (item: Item) => Promise<Output | null>;
}

export interface QueueResult {
  ran: number;
  costUSD: number;
  isStoppedAtBudget: boolean;
  isStoppedByFailure: boolean;
}

// Runs each item and appends its output to the file as one JSON line. No item starts once the spend
// reaches the budget or the run reaches its limit, so the spend passes the budget by at most the
// items in flight. An item with no output, such as a call the model API refused, writes nothing and
// stops the run, so a rerun tries it again.
export async function runBudgetedQueue<Item, Output extends { costUSD: number }>(
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

  const workers = Array.from({ length: queue.concurrency }, async () => {
    for (let next = pending.shift(); next !== undefined; next = pending.shift()) {
      if (result.isStoppedByFailure || (queue.limit !== null && started >= queue.limit)) {
        return;
      }

      if (result.costUSD >= queue.budgetUSD) {
        result.isStoppedAtBudget = true;

        return;
      }

      started += 1;

      const output = await queue.runItem(next);

      if (output === null) {
        result.isStoppedByFailure = true;

        return;
      }

      result.costUSD += output.costUSD;
      result.ran += 1;
      await appendFile(queue.outPath, `${JSON.stringify(output)}\n`, { mode: 0o600 });
    }
  });

  await Promise.all(workers);

  return result;
}
