import { rename } from 'node:fs/promises';
import type { Logger } from '@heynixie/logger';
import type {
  Measures,
  Overrides,
  PeriodChange,
  PeriodRead,
  PeriodStore,
  PeriodStoreHandle,
  Refusal,
  RoutePeriods,
  SpendTarget,
} from '../types';
import { buildEmptyRoute, buildFreshStore } from './build-fresh-store';
import { buildResetStore } from './build-reset-store';
import { buildTrippedStore } from './build-tripped-store';
import type { LimitTable } from './limit-table';
import { parsePeriodStore } from './parse-period-store';
import { parseStartStore } from './parse-start-store';
import { toMicros } from './to-micros';

export interface PeriodStoreOptions {
  readonly path: string;
  readonly zone: string;

  // the limits of each configured route and provider, which the store stamps a trip against
  readonly limits: LimitTable;
  readonly now: () => number;
  readonly readOverrides: () => Promise<Overrides>;
  readonly log: Logger;
}

export async function createPeriodStore(options: PeriodStoreOptions): Promise<PeriodStoreHandle> {
  const path = options.path;
  const routeIDs = Object.keys(options.limits.routes);
  const providerIDs = Object.keys(options.limits.providers);

  const exists = await Bun.file(path).exists();

  if (exists) {
    const stored: unknown = await Bun.file(path).json();

    // the count of an earlier store moves to the route form in one write; any other shape throws
    const start = parseStartStore(stored, options.now(), options.zone, options.limits);

    if (start.kind === 'moved') {
      await writeStore(path, start.store);

      for (const step of start.steps) {
        options.log('store.moved', { ...step, lost: start.store.lost }, 'warn');
      }
    }
  } else {
    await writeStore(path, buildFreshStore(options.now(), options.zone, routeIDs, providerIDs));
  }

  // one change at a time, so two replies that end together never write over each other's count,
  // and a reset and the count that follows it never interleave
  let tail = Promise.resolve();

  // the instant of the latest write that moved a trip stamp, so that a trip cleared and reached
  // again in the same millisecond still gets a stamp of its own
  let lastStampMs = 0;

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

  // the reset reaches the file before any caller sees it, so a read after midnight needs no reply.
  // A route or a provider that the config gained since the last write starts at zero.
  const readReset = async (): Promise<{ store: PeriodStore; didChange: boolean }> => {
    const stored = await readStore(path);

    const addedRoutes = routeIDs.filter((id) => !Object.hasOwn(stored.routes, id));
    const addedProviders = providerIDs.filter((id) => !Object.hasOwn(stored.providers, id));

    const complete =
      addedRoutes.length === 0 && addedProviders.length === 0
        ? stored
        : {
            ...stored,
            routes: {
              ...stored.routes,
              ...Object.fromEntries(
                addedRoutes.map((id) => [id, buildEmptyRoute(options.now(), options.zone)]),
              ),
            },
            providers: {
              ...stored.providers,
              ...Object.fromEntries(
                addedProviders.map((id) => [id, buildEmptyRoute(options.now(), options.zone)]),
              ),
            },
          };

    const store = buildResetStore(complete, options.now(), options.zone);

    return { store, didChange: store !== stored };
  };

  // each change also stamps the instant a route period first reaches its limit in force, so a later
  // read reports when the limit was reached rather than when it was read
  const changeAndRead = <T>(
    decide: (store: PeriodStore) => PeriodChange<T>,
  ): Promise<{ result: T; read: PeriodRead }> =>
    withTurn(async () => {
      const read = await readReset();

      const decided = decide(read.store);
      const decidedStore = decided.store ?? read.store;

      const overrides = await options.readOverrides();

      const stampMs = Math.max(options.now(), lastStampMs + 1);

      const next = buildTrippedStore(
        decidedStore,
        options.limits,
        overrides,
        new Date(stampMs).toISOString(),
      );

      if (next !== decidedStore) {
        lastStampMs = stampMs;
      }

      if (decided.store !== null || read.didChange || next !== decidedStore) {
        await writeStore(path, next);
      }

      return { result: decided.result, read: { store: next, overrides } };
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

  const addSpend = async (
    target: SpendTarget,
    sandbox: string | null,
    spend: Measures,
  ): Promise<PeriodRead> => {
    const changed = await changeAndRead((store) => ({
      store: buildSpentStore(store, target, sandbox, spend),
      result: undefined,
    }));

    return changed.read;
  };

  const writeRefusal = async (sandbox: string, refusal: Refusal): Promise<void> => {
    await change((store) => {
      if (!Object.hasOwn(store.sandboxes, sandbox)) {
        return { store: null, result: undefined };
      }

      const held = store.sandboxes[sandbox];

      return held === undefined
        ? { store: null, result: undefined }
        : {
            store: {
              ...store,
              sandboxes: { ...store.sandboxes, [sandbox]: { ...held, lastRefusal: refusal } },
            },
            result: undefined,
          };
    });
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

  return { read, readInForce, change, addSpend, writeRefusal, markLost, settle };
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

function buildSpentStore(
  store: PeriodStore,
  target: SpendTarget,
  sandbox: string | null,
  spend: Measures,
): PeriodStore {
  const held =
    sandbox !== null && Object.hasOwn(store.sandboxes, sandbox)
      ? store.sandboxes[sandbox]
      : undefined;

  const micros = toMicros(spend.dollars);

  return {
    ...store,
    routes: addMicros(store.routes, target.route, micros),
    providers: addMicros(store.providers, target.provider, micros),
    sandboxes:
      sandbox === null || held === undefined
        ? store.sandboxes
        : {
            ...store.sandboxes,
            [sandbox]: {
              ...held,
              micros: held.micros + micros,
              tokens: held.tokens + spend.tokens,
            },
          },
  };
}

// the periods of one route or provider, with the dollars added to its day and its month
function addMicros(
  held: Readonly<Record<string, RoutePeriods>>,
  id: string,
  micros: number,
): Readonly<Record<string, RoutePeriods>> {
  const periods = Object.hasOwn(held, id) ? held[id] : undefined;

  return periods === undefined
    ? held
    : {
        ...held,
        [id]: {
          day: { ...periods.day, micros: periods.day.micros + micros },
          month: { ...periods.month, micros: periods.month.micros + micros },
        },
      };
}
