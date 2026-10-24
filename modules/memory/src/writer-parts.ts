import type { PromptOverrides } from '@heynixie/prompts';
import type { StepInput, TasksContext } from '@heynixie/tasks';
import type { WriterStaging } from './create-writer-staging';
import type { MemoryProposals } from './gate-types';
import type { MemoryStore } from './types';
import type { BatchPublication, PublishResult } from './write-memory-batch';
import type { WriterConfig } from './writer-config-schema';
import type { WriterGate, WriterModel, WriterRow } from './writer-types';

export interface WriterParts {
  readonly context: TasksContext;
  readonly store: Pick<MemoryStore, 'recall'> & {
    readonly proposals: Pick<MemoryProposals, 'listPending'>;
  };
  readonly publish: (publication: BatchPublication) => Promise<PublishResult>;
  readonly staging: WriterStaging;
  readonly model: WriterModel;
  readonly gate: WriterGate;
  readonly config: WriterConfig;

  readonly getPersona: () => string;
  readonly getPrompts: () => PromptOverrides;

  readonly ownerName: string | null;

  readonly assistantName: string | null;

  readonly defaultZone: string;
}

export interface WriterStepState {
  readonly input: StepInput;
  readonly row: WriterRow;
  readonly now: number;
}
