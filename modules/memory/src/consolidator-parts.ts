import type { PromptOverrides } from '@heynixie/prompts';
import type { TasksContext } from '@heynixie/tasks';
import type { ConsolidationConfig } from './consolidation-config-schema';
import type { MemoryConsolidations } from './consolidation-types';
import type { ConsolidationStaging } from './create-consolidation-staging';
import type { MemoryStore } from './types';
import type { WriterModel } from './writer-types';

export interface ConsolidatorParts {
  readonly context: TasksContext;
  readonly store: Pick<MemoryStore, 'recall'> & {
    readonly consolidations: Pick<MemoryConsolidations, 'readSchedule' | 'lapse'>;
  };
  readonly staging: ConsolidationStaging;

  readonly model: WriterModel;
  readonly config: ConsolidationConfig;

  readonly getPersona: () => string;
  readonly getPrompts: () => PromptOverrides;

  readonly ownerName: string | null;

  readonly onError: (error: unknown) => void;
}
