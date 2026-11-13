import { rename } from 'node:fs/promises';
import { z } from 'zod';
import type { CounterStore, SpendTotals, StoredCount } from './types';

export async function createCounterStore(path: string): Promise<CounterStore> {
  const exists = await Bun.file(path).exists();

  if (!exists) {
    await writeCount(path, { dollars: 0, tokens: 0, lost: false });
  }

  // one change at a time, so two replies that end together never write over each other's count
  let tail = Promise.resolve();

  const withTurn = async <T>(change: () => Promise<T>): Promise<T> => {
    const previous = tail;
    const turn = Promise.withResolvers<undefined>();

    tail = turn.promise;

    await previous;

    try {
      return await change();
    } finally {
      turn.resolve(undefined);
    }
  };

  const add = (spend: SpendTotals): Promise<SpendTotals> =>
    withTurn(async () => {
      const stored = await readCount(path);

      const sum = { dollars: stored.dollars + spend.dollars, tokens: stored.tokens + spend.tokens };

      await writeCount(path, { ...sum, lost: stored.lost });

      return sum;
    });

  const markLost = (): Promise<void> =>
    withTurn(async () => {
      const stored = await readCount(path);

      await writeCount(path, { ...stored, lost: true });
    });

  const settle = async (): Promise<void> => {
    let awaited: Promise<unknown>;

    do {
      awaited = tail;

      await awaited;
    } while (awaited !== tail);
  };

  return { read: () => readCount(path), add, markLost, settle };
}

// a crash between the write and the rename leaves the last whole count in place; the file holds
// the lost mark only while it stands, so an operator clears it by deleting the field
async function writeCount(path: string, count: StoredCount): Promise<void> {
  const part = `${path}.part`;
  const stored = count.lost ? count : { dollars: count.dollars, tokens: count.tokens };

  await Bun.write(part, JSON.stringify(stored), { createPath: false });

  await rename(part, path);
}

const countSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  lost: z.boolean().default(false),
});

async function readCount(path: string): Promise<StoredCount> {
  const stored: unknown = await Bun.file(path).json();

  return countSchema.parse(stored);
}
