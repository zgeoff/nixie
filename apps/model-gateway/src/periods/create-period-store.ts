import { rename } from 'node:fs/promises';
import type { Measures, PeriodChange, PeriodStore, PeriodStoreHandle } from '../types';
import { buildFreshStore } from './build-fresh-store';
import { buildResetStore } from './build-reset-store';
import { getLocalDate } from './get-local-date';
import { parsePeriodStore } from './parse-period-store';

export interface PeriodStoreOptions {
  readonly path: string;
  readonly zone: string;
  readonly now: () => number;
}

export async function createPeriodStore(options: PeriodStoreOptions): Promise<PeriodStoreHandle> {
  const path = options.path;

  const exists = await Bun.file(path).exists();

  const today = getLocalDate(options.now(), options.zone);

  // a file in another shape, such as the count of a limits config, stops the start
  await (exists ? readStore(path) : writeStore(path, buildFreshStore(today)));

  // one change at a time, so two replies that end together never write over each other's count,
  // and a reset and the count that follows it never interleave
  let tail = Promise.resolve();

  const withTurn = async <T>(run: () => Promise<T>): Promise<T> => {
    const previous = tail;
    const turn = Promise.withResolvers<undefined>();

    tail = turn.promise;

    await previous;

    try {
      return await run();
    } finally {
      turn.resolve(undefined);
    }
  };

  // the reset reaches the file before any caller sees it, so a read after midnight needs no reply
  const readReset = async (): Promise<{ store: PeriodStore; didReset: boolean }> => {
    const stored = await readStore(path);

    const currentDay = getLocalDate(options.now(), options.zone);
    const store = buildResetStore(stored, currentDay);

    return { store, didReset: store !== stored };
  };

  const change = <T>(decide: (store: PeriodStore) => PeriodChange<T>): Promise<T> =>
    withTurn(async () => {
      const read = await readReset();

      const decided = decide(read.store);
      const next = decided.store ?? (read.didReset ? read.store : null);

      if (next !== null) {
        await writeStore(path, next);
      }

      return decided.result;
    });

  const read = (): Promise<PeriodStore> => change((store) => ({ store: null, result: store }));

  const addSpend = (sandbox: string | null, spend: Measures): Promise<PeriodStore> =>
    change((store) => {
      const next = buildSpentStore(store, sandbox, spend);

      return { store: next, result: next };
    });

  const markLost = (): Promise<void> =>
    change((store) => ({ store: { ...store, lost: true }, result: undefined }));

  const settle = async (): Promise<void> => {
    let awaited: Promise<unknown>;

    do {
      awaited = tail;

      await awaited;
    } while (awaited !== tail);
  };

  return { read, change, addSpend, markLost, settle };
}

async function readStore(path: string): Promise<PeriodStore> {
  const stored: unknown = await Bun.file(path).json();

  return parsePeriodStore(stored);
}

// a crash between the write and the rename leaves the last whole store in place; the file holds the
// lost mark only while it stands, so an operator clears it by deleting the field
async function writeStore(path: string, store: PeriodStore): Promise<void> {
  const part = `${path}.part`;
  const { lost, ...rest } = store;
  const stored = lost ? { ...rest, lost } : rest;

  await Bun.write(part, JSON.stringify(stored), { createPath: false });

  await rename(part, path);
}

function buildSpentStore(store: PeriodStore, sandbox: string | null, spend: Measures): PeriodStore {
  const held =
    sandbox !== null && Object.hasOwn(store.sandboxes, sandbox)
      ? store.sandboxes[sandbox]
      : undefined;

  const day = store.periods.day;
  const month = store.periods.month;

  return {
    ...store,
    periods: {
      day: { ...day, dollars: day.dollars + spend.dollars, tokens: day.tokens + spend.tokens },
      month: {
        ...month,
        dollars: month.dollars + spend.dollars,
        tokens: month.tokens + spend.tokens,
      },
    },
    sandboxes:
      sandbox === null || held === undefined
        ? store.sandboxes
        : {
            ...store.sandboxes,
            [sandbox]: {
              ...held,
              dollars: held.dollars + spend.dollars,
              tokens: held.tokens + spend.tokens,
            },
          },
  };
}
