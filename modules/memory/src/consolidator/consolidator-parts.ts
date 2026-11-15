import type { PromptOverrides } from '@heynixie/prompts';
import type { TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { ConsolidationStaging } from '../consolidation/create-consolidation-staging';
import type { MemoryStore } from '../types';
import type { MemoryConsolidations } from '../utils/memory-consolidations';
import type { ConsolidationConfig } from '../utils/schema/consolidation-config-schema';
import type { ConsolidatorModel } from './consolidator-model';

export interface ConsolidatorParts {
  readonly context: TasksContext;
  readonly store: Pick<MemoryStore, 'recall'> & {
    readonly consolidations: Pick<MemoryConsolidations, 'readSchedule' | 'lapse'>;
  };
  readonly staging: ConsolidationStaging;

  readonly model: ConsolidatorModel;
  readonly config: ConsolidationConfig;

  readonly getPersona: () => string;
  readonly getPrompts: () => PromptOverrides;

  readonly ownerName: string | null;
  readonly defaultZone: string;
  readonly messaging: TaskMessaging;

  readonly onError: (error: unknown) => void;
}
