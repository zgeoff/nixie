import type { Log } from '@heynixie/log';
import type { SeedResult } from '../rule/run-seed';
import type { InForceSeedOptions } from '../seed/run-in-force-seed';
import type { CheckTaskStart } from '../task/types';
import type { DefinitionOperation } from '../types';

export type DefinitionRefusal =
  | { readonly code: 'ID_TAKEN' }
  | { readonly code: 'NOT_FOUND' }
  | { readonly code: 'UNCHANGED' }
  | { readonly code: 'FILE_ONLY_KEYS' }
  | { readonly code: 'INVALID'; readonly reasons: readonly string[] }
  | { readonly code: 'ONE_SHOT_OVER_REPO' }
  | { readonly code: 'ONE_SHOT_PAST' }
  | {
      readonly code: 'REPLACED';
      readonly head: {
        readonly changeID: string;
        readonly shortID: string;
        readonly operation: DefinitionOperation;
      };
    }
  | { readonly code: 'REPO_MOVED'; readonly seedSequence: number }
  | {
      readonly code: 'NOT_IN_FORCE';
      readonly cause: 'one_shot_fired' | 'one_shot_skipped' | 'kept_repo';
    };

export type DefinitionChangeResult =
  | {
      readonly status: 'changed';
      readonly definitionID: string;
      readonly changeID: string;
      readonly shortID: string;

      // set when an undo put the repo's version in force
      readonly restored?: 'repo';
    }
  | { readonly status: 'refused'; readonly refusal: DefinitionRefusal };

export interface DefinitionsContext {
  readonly log: Log;
  readonly checkTaskStart: CheckTaskStart;

  // the name of each registered tool
  readonly toolNames: readonly string[];

  // the seed of the definitions source, through the server's seed queue
  readonly runSeed: () => Promise<SeedResult>;

  readonly inForceSeed: InForceSeedOptions;

  // takes the result of the seed that a change or a resolve runs in its own transaction
  readonly onSeeded: (result: SeedResult) => void;

  // wakes the export, which the caller does not wait for
  readonly wakeExport: () => void;
}
