import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { taskLimitsSchema } from '../../limit/task-limits-schema';
import { taskRunOptionsSchema } from '../../limit/task-run-options-schema';
import { taskStateSchema } from '../../utils/task-state-schema';

const envelopeSchema = z.object({
  report: z.enum(['wake', 'next_turn', 'none']),
  limits: taskLimitsSchema,
});

// The record holds one more key, `runnerOptions`, which only the task's runner reads, with its own
// parser. A codec cannot type it: ReadonlyDeep of the recursive JSON type never resolves.
export const taskCreatedCodec = defineRecordCodec(
  'task.created',
  z.object({
    taskID: z.string(),
    isConversation: z.boolean(),
    state: taskStateSchema,
    startedBy: z.string().exactOptional(),
    startStep: z.string().exactOptional(),
    options: taskRunOptionsSchema.exactOptional(),
    runner: z.string().exactOptional(),
    envelope: envelopeSchema.exactOptional(),
    briefMessageID: z.string().exactOptional(),
  }),
);
