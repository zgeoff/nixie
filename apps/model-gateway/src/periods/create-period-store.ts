import { rename } from 'node:fs/promises';
import type { Logger } from '@heynixie/logger';
import type {
  Measures,
  Override,
  PeriodChange,
  PeriodRead,
  PeriodStore,
  PeriodStoreHandle,
} from '../types';
import { buildFreshStore } from './build-fresh-store';
import { buildResetStore } from './build-reset-store';
import { buildTrippedStore } from './build-tripped-store';
import { parsePeriodStore } from './parse-period-store';
import { parseStartStore } from './parse-start-store';

export interface PeriodStoreOptions {
  readonly path: string;
  readonly zone: string;
  readonly now: () => number;
  readonly readOverride: () => Promise<Override | null>;
  readonly log: Logger;
}

export async function createPeriodStore(options: PeriodStoreOptions): Promise<PeriodStoreHandle> {
  const path = options.path;

  const exists = await Bun.file(path).exists();

  if (exists) {
    const stored: unknown = await Bun.file(path).json();

    // the count of a limits config moves to the periods form in one write; any other shape throws
    const start = parseStartStore(stored, options.now(), options.zone);

    if (start.kind === 'moved') {
      await writeStore(path, start.store);

      options.log('store.moved', { ...start.old, lost: start.store.lost }, 'warn');
    }
  } else {
    await writeStore(path, buildFreshStore(options.now(), options.zone));
  }

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

    const store = buildResetStore(stored, options.now(), options.zone);

    return { store, didReset: store !== stored };
  };

  // each change also stamps the instant a period first reaches its limit in force, so a later read
  // reports when the limit was reached rather than when it was read
  const changeAndRead = <T>(
    decide: (store: PeriodStore) => PeriodChange<T>,
  ): Promise<{ result: T; read: PeriodRead }> =>
    withTurn(async () => {
      const read = await readReset();

      const decided = decide(read.store);
      const decidedStore = decided.store ?? read.store;

      const override = await options.readOverride();

      const at = new Date(options.now()).toISOString();

      const next = buildTrippedStore(decidedStore, override, at);

      if (decided.store !== null || read.didReset || next !== decidedStore) {
        await writeStore(path, next);
      }

      return { result: decided.result, read: { store: next, override } };
    });

  const change = async <T>(decide: (store: PeriodStore) => PeriodChange<T>): Promise<T> => {
    const changed = await changeAndRead(decide);

    return changed.result;
  };

  const readInForce = async (): Promise<PeriodRead> => {
    const changed = await changeAndRead(() => ({ store: null, result: undefined }));

    return changed.read;
  };

  const read = async (): Promise<PeriodStore> => {
    const held = await readInForce();

    return held.store;
  };

  const addSpend = async (sandbox: string | null, spend: Measures): Promise<PeriodRead> => {
    const changed = await changeAndRead((store) => ({
      store: buildSpentStore(store, sandbox, spend),
      result: undefined,
    }));

    return changed.read;
  };

  const markLost = (): Promise<void> =>
    change((store) => ({ store: { ...store, lost: true }, result: undefined }));

  const settle = async (): Promise<void> => {
    let awaited: Promise<unknown>;

    do {
      awaited = tail;

      await awaited;
    } while (awaited !== tail);
  };

  return { read, readInForce, change, addSpend, markLost, settle };
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

async function readStore(path: string): Promise<PeriodStore> {
  const stored: unknown = await Bun.file(path).json();

  return parsePeriodStore(stored);
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
