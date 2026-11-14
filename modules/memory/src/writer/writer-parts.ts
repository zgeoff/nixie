import type { PromptOverrides } from '@heynixie/prompts';
import type { StepInput, TaskMessaging, TasksContext } from '@heynixie/tasks';
import type { MemoryProposals } from '../gate/gate-context';
import type { BatchPublication, PublishResult } from '../memory/write-memory-batch';
import type { MemoryStore } from '../types';
import type { WriterConfig } from '../utils/schema/writer-config-schema';
import type { WriterStaging } from './create-writer-staging';
import type { WriterGate, WriterModel, WriterRow } from './writer-model';

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

  readonly messaging: TaskMessaging;
}

export interface WriterStepState {
  readonly input: StepInput;
  readonly row: WriterRow;
  readonly now: number;
}
