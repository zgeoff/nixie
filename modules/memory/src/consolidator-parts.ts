import type { PromptOverrides } from '@heynixie/prompts';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ConsolidationConfig } from './consolidation-config-schema';
import type { ConsolidationStaging } from './create-consolidation-staging';
import type { MemoryConsolidations } from './memory-consolidations';
import type { MemoryStore } from './types';
import type { WriterModel } from './writer-model';

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
  readonly defaultZone: string;
  readonly messaging: TaskMessaging;

  readonly onError: (error: unknown) => void;
}
