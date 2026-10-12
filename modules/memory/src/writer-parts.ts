import type { StepInput, TasksContext } from '@heynixie/tasks';
import type { WriterStaging } from './create-writer-staging';
import type { MemoryStore } from './types';
import type { BatchPublication, PublishResult } from './write-memory-batch';
import type { WriterConfig } from './writer-config-schema';
import type { WriterGate, WriterModel, WriterRow } from './writer-types';

// What the writer's step reaches: the log and the clock, the store's recall and the batch publish,
// the staging area its tools write to, its model, the content gate and its settings.
export interface WriterParts {
  readonly context: TasksContext;
  readonly store: Pick<MemoryStore, 'recall'>;
  readonly publish: (publication: BatchPublication) => Promise<PublishResult>;
  readonly staging: WriterStaging;
  readonly model: WriterModel;
  readonly gate: WriterGate;
  readonly config: WriterConfig;

  // the persona in force, read at each batch so a new seed reaches the next batch
  readonly getPersona: () => string;
}

// One writer step as its parts see it: the step's input, the writer's row as the step began, and
// the clock's time then.
export interface WriterStepState {
  readonly input: StepInput;
  readonly row: WriterRow;
  readonly now: number;
}
