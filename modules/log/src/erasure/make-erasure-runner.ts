import type { ErasableKind } from '../erasure/erasable-kind';
import type { Definitions, Log } from '../types';
import type { ErasureEffects } from './erasure-effects';
import { readOpenErasures } from './read-open-erasures';
import type { OpenErasure } from './read-open-erasures';
import type { ErasureRunContext } from './run-erasure-tree';
import { runErasureTree } from './run-erasure-tree';
import type {
  Erasable,
  ErasureEntry,
  ErasureHandle,
  ErasureRegistry,
  RegisteredErasable,
} from './types';
import type { BeginOptions } from './write-erasure-started';
import { writeErasureStarted } from './write-erasure-started';

export interface ErasureRunnerOptions {
  readonly log: Log;
  readonly definitions: () => Definitions;
  readonly effects: ErasureEffects;
}

export interface StuckQuery {
  readonly nowMs: number;
  readonly stuckAfterMs: number;
}

export interface StuckErasure {
  readonly erasureID: string;
  readonly kind: ErasableKind;
  readonly shortID: string | null;
  readonly openForMs: number;
}

export interface StuckRetry {
  readonly stillOpen: readonly StuckErasure[];
  readonly failures: readonly unknown[];
}

export interface ErasureRunnerControl extends ErasureRegistry {
  // At each start, after the session cleanup and before any claim pool or turn-input intake: starts
  // the forgets that a store's old pipeline left open, then finishes every erasure that has
  // erasure.started and no erasure.finished, children before parents.
  readonly finishOpen: () => Promise<void>;

  // Runs again each erasure that has been open for stuckAfterMs or longer at nowMs, and returns what
  // is still open after the retry, oldest first, with the failures that the retries threw. An
  // erasure younger than that may still wait on the step that called it, so it is left alone.
  readonly retryStuck: (query: StuckQuery) => Promise<StuckRetry>;

  // The erasures open for stuckAfterMs or longer at nowMs, oldest first. It runs nothing, so a
  // screen may read it as often as it likes.
  readonly readStuck: (query: StuckQuery) => Promise<readonly StuckErasure[]>;
}

export function makeErasureRunner(options: ErasureRunnerOptions): ErasureRunnerControl {
  const entries = new Map<ErasableKind, ErasureEntry>();

  const context: ErasureRunContext = { ...options, entries };

  // One tree runs at a time. A retry of the same forget, or a catch-up beside it, then waits, reads
  // the open erasures again, and finds nothing left to run, so no cleanup runs twice and no run
  // releases the capture hold that another still needs.
  const queue = { tail: Promise.resolve() };

  const runSerially = <T>(task: () => Promise<T>): Promise<T> => {
    const previous = queue.tail;

    const run = (async () => {
      await previous;

      return task();
    })();

    queue.tail = (async () => {
      await run.catch(() => {});
    })();

    return run;
  };

  return {
    register: (erasable) => {
      entries.set(erasable.kind, buildEntry(options, erasable));

      return buildHandle(options, context, erasable, runSerially);
    },
    finishOpen: () =>
      runSerially(async () => {
        for (const entry of entries.values()) {
          await entry.beginLegacy();
        }

        // A kind that nothing registered, such as a feature that is off, stays open until it is on.
        const skipped = new Set<string>();

        for (;;) {
          const open = await readOpenErasures(options.log);

          const first = open.find(
            (erasure) =>
              entries.has(erasure.started.kind) && !skipped.has(erasure.started.erasureID),
          );

          if (first === undefined) {
            return;
          }

          const root = pickTopmost(open, first);

          if (entries.has(root.started.kind)) {
            await runErasureTree(context, root);
          } else {
            skipped.add(first.started.erasureID);
          }
        }
      }),
    readStuck: async (query) => {
      const open = await readOpenErasures(options.log);

      return pickStuck(open, query);
    },
    retryStuck: (query) =>
      runSerially(async () => {
        const failures: unknown[] = [];

        const open = await readOpenErasures(options.log);

        for (const root of collectStuckRoots(open, query)) {
          try {
            await runErasureTree(context, root);
          } catch (error) {
            failures.push(error);
          }
        }

        const reread = await readOpenErasures(options.log);

        return { stillOpen: pickStuck(reread, query), failures };
      }),
  };
}

function buildEntry<Request>(
  options: ErasureRunnerOptions,
  erasable: RegisteredErasable<Request>,
): ErasureEntry {
  return {
    descriptor: erasable,
    hide: (target) => erasable.hide(target),
    revoke: (target) => erasable.revoke?.(target) ?? Promise.resolve(),
    readChildren: (tx, target) => erasable.readChildren(tx, target),
    cleanIndexes: (target) => erasable.cleanIndexes(target),
    beginChild: (target, parent) =>
      beginErasure(options, erasable, erasable.toRequest(target), { by: parent.by, parent }),
    beginLegacy: async () => {
      const open = await erasable.readLegacyOpen?.();

      for (const legacy of open ?? []) {
        await beginErasure(options, erasable, legacy.request, { by: legacy.by });
      }
    },
  };
}

async function beginErasure<Request>(
  options: ErasureRunnerOptions,
  erasable: Erasable<Request>,
  request: Request,
  startOptions: BeginOptions,
) {
  const begun = await writeErasureStarted(options, erasable, request, startOptions);

  if (begun.status === 'begun') {
    if (NIXIE_TEST_BUILD) {
      await options.effects.reachFaultPoint('erasure.begun', begun.erasureID);
    }

    await erasable.hide(begun.target);
  }

  return begun;
}

function buildHandle<Request>(
  options: ErasureRunnerOptions,
  context: ErasureRunContext,
  erasable: RegisteredErasable<Request>,
  runSerially: <T>(task: () => Promise<T>) => Promise<T>,
): ErasureHandle<Request> {
  return {
    begin: (request, startOptions) => beginErasure(options, erasable, request, startOptions),
    finish: (targetID) =>
      runSerially(async () => {
        const open = await readOpenErasures(options.log);

        const found = open.find(
          (erasure) =>
            erasure.started.kind === erasable.kind && erasure.started.targetID === targetID,
        );

        if (found !== undefined) {
          await runErasureTree(context, pickTopmost(open, found));
        }
      }),
  };
}

function pickTopmost(open: readonly OpenErasure[], erasure: OpenErasure): OpenErasure {
  const parent = open.find((other) => other.started.erasureID === erasure.started.parentID);

  return parent === undefined ? erasure : pickTopmost(open, parent);
}

function pickStuck(open: readonly OpenErasure[], query: StuckQuery): readonly StuckErasure[] {
  return open
    .map((erasure) => ({
      erasureID: erasure.started.erasureID,
      kind: erasure.started.kind,
      shortID: erasure.started.shortID,
      openForMs: query.nowMs - erasure.startedAtMs,
    }))
    .filter((erasure) => erasure.openForMs >= query.stuckAfterMs)
    .toSorted((left, right) => right.openForMs - left.openForMs);
}

// The topmost erasure of each tree that holds a stuck erasure, each once.
function collectStuckRoots(
  open: readonly OpenErasure[],
  query: StuckQuery,
): readonly OpenErasure[] {
  const stuckIDs = new Set(pickStuck(open, query).map((erasure) => erasure.erasureID));

  const roots = new Map(
    open
      .filter((erasure) => stuckIDs.has(erasure.started.erasureID))
      .map((erasure) => pickTopmost(open, erasure))
      .map((root) => [root.started.erasureID, root] as const),
  );

  return [...roots.values()];
}
