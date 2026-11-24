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

export interface ErasureRunnerControl extends ErasureRegistry {
  // At each start, after the session cleanup and before any claim pool or turn-input intake: starts
  // the forgets that a store's old pipeline left open, then finishes every erasure that has
  // erasure.started and no erasure.finished, children before parents.
  readonly finishOpen: () => Promise<void>;
}

export function makeErasureRunner(options: ErasureRunnerOptions): ErasureRunnerControl {
  const entries = new Map<ErasableKind, ErasureEntry>();

  const context: ErasureRunContext = { ...options, entries };

  return {
    register: (erasable) => {
      entries.set(erasable.kind, buildEntry(options, erasable));

      return buildHandle(options, context, erasable);
    },
    finishOpen: async () => {
      for (const entry of entries.values()) {
        await entry.beginLegacy();
      }

      for (;;) {
        const open = await readOpenErasures(options.log);

        const [first] = open;

        if (first === undefined) {
          return;
        }

        await runErasureTree(context, pickTopmost(open, first));
      }
    },
  };
}

function buildEntry<Request>(
  options: ErasureRunnerOptions,
  erasable: RegisteredErasable<Request>,
): ErasureEntry {
  return {
    descriptor: erasable,
    hide: (target) => erasable.hide(target),
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
      await options.effects.reachFaultPoint('erasure.started', begun.erasureID);
    }

    await erasable.hide(begun.target);
  }

  return begun;
}

function buildHandle<Request>(
  options: ErasureRunnerOptions,
  context: ErasureRunContext,
  erasable: RegisteredErasable<Request>,
): ErasureHandle<Request> {
  return {
    begin: (request, startOptions) => beginErasure(options, erasable, request, startOptions),
    finish: async (targetID) => {
      const open = await readOpenErasures(options.log);

      const found = open.find(
        (erasure) =>
          erasure.started.kind === erasable.kind && erasure.started.targetID === targetID,
      );

      if (found !== undefined) {
        await runErasureTree(context, pickTopmost(open, found));
      }
    },
  };
}

function pickTopmost(open: readonly OpenErasure[], erasure: OpenErasure): OpenErasure {
  const parent = open.find((other) => other.started.erasureID === erasure.started.parentID);

  return parent === undefined ? erasure : pickTopmost(open, parent);
}
