import { rename } from 'node:fs/promises';
import { z } from 'zod';
import type { CounterStore, SpendTotals } from './types';

export async function createCounterStore(path: string): Promise<CounterStore> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    await writeTotals(path, { dollars: 0, tokens: 0 });
  }

  // one add at a time, so two replies that end together never write over each other's count
  let tail = Promise.resolve();

  const add = async (spend: SpendTotals): Promise<SpendTotals> => {
    const previous = tail;
    const turn = Promise.withResolvers<undefined>();

    tail = turn.promise;

    await previous;

    try {
      const totals = await readTotals(path);

      const sum = { dollars: totals.dollars + spend.dollars, tokens: totals.tokens + spend.tokens };

      await writeTotals(path, sum);

      return sum;
    } finally {
      turn.resolve(undefined);
    }
  };

  return { read: () => readTotals(path), add };
}

// a crash between the write and the rename leaves the last whole count in place
async function writeTotals(path: string, totals: SpendTotals): Promise<void> {
  const part = `${path}.part`;

  await Bun.write(part, JSON.stringify(totals), { createPath: false });

  await rename(part, path);
}

const totalsSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
});

async function readTotals(path: string): Promise<SpendTotals> {
  const stored: unknown = await Bun.file(path).json();

  return totalsSchema.parse(stored);
}
