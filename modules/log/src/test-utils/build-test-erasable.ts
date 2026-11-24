import type { ErasableKind } from '../erasure/erasable-kind';
import { ErasureRefusedError } from '../erasure/erasure-refused-error';
import type { RegisteredErasable } from '../erasure/types';

export interface TestErasureTarget {
  readonly id: string;
  readonly keyIDs: readonly string[];

  // the targets of the child kind that must finish before this one
  readonly childIDs: readonly string[];
  readonly version?: number;
}

export interface TestErasureRequest {
  readonly id: string;
  readonly version?: number;
}

export interface TestErasableOptions {
  readonly kind: ErasableKind;
  readonly childKind: ErasableKind;
  readonly targets: readonly TestErasureTarget[];
  readonly events: string[];
}

// An erasable over a list of targets, for a test of the runner. It captures each target's keys,
// names its children, and records each hide and index clean in `events`.
export function buildTestErasable(
  options: TestErasableOptions,
): RegisteredErasable<TestErasureRequest> {
  const find = (id: string) => options.targets.find((target) => target.id === id);

  return {
    kind: options.kind,
    recordKinds: { erasable: [], forgettable: [], unforgettable: [] },
    legacyEnds: [],
    start: (_tx, request) => {
      const target = find(request.id);

      if (target === undefined) {
        throw new ErasureRefusedError('not_found');
      }

      if (request.version !== undefined && request.version !== (target.version ?? 1)) {
        throw new ErasureRefusedError('stale');
      }

      return Promise.resolve({
        target: { kind: options.kind, targetID: target.id, version: target.version ?? 1 },
        shortID: `short-${target.id}`,
        capture: {
          keys: { ids: [...target.keyIDs] },
          cleanupKeys: [],
          sandboxCallIDs: [],
          purges: [],
          sessionCause: { noteID: target.id },
          turnInputs: { threads: [], cleaned: false, floor: null },
        },
      });
    },
    hide: (target) => {
      options.events.push(`hide ${target.targetID}`);

      return Promise.resolve();
    },
    readChildren: (_tx, target) =>
      Promise.resolve(
        (find(target.targetID)?.childIDs ?? []).map((id) => ({
          kind: options.childKind,
          targetID: id,
          version: null,
        })),
      ),
    toRequest: (target) => ({ id: target.targetID }),
    cleanIndexes: (target) => {
      options.events.push(`cleanIndexes ${target.targetID}`);

      return Promise.resolve();
    },
  };
}
