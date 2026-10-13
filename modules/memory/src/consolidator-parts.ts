import type { TasksContext } from '@heynixie/tasks';
import type { ConsolidationConfig } from './consolidation-config-schema';
import type { MemoryConsolidations } from './consolidation-types';
import type { ConsolidationStaging } from './create-consolidation-staging';
import type { MemoryStore } from './types';
import type { WriterModel } from './writer-types';

// What the consolidator's step reaches: the log and the clock, the store's recall and its diffs'
// schedule and lapses, the staging area its tools write to, its model and its settings.
export interface ConsolidatorParts {
  readonly context: TasksContext;
  readonly store: Pick<MemoryStore, 'recall'> & {
    readonly consolidations: Pick<MemoryConsolidations, 'readSchedule' | 'lapse'>;
  };
  readonly staging: ConsolidationStaging;

  // one fresh session for each run, on the memory-consolidator role's profile, with the
  // consolidator's tools served to it
  readonly model: WriterModel;
  readonly config: ConsolidationConfig;

  // the persona in force, read at each run
  readonly getPersona: () => string;

  // a run failed; the step logs it and tries again after the retry wait
  readonly onError: (error: unknown) => void;
}
