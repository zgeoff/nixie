import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const detailSchema = z.record(z.string(), z.union([z.string(), z.number()]));

const usedSchema = z.object({
  turns: z.number(),
  dollars: z.number(),
  calls: z.record(z.string(), z.number()),
});

export const taskRunEndedCodec = defineRecordCodec(
  'task.run_ended',
  z.object({
    taskID: z.string(),
    runID: z.string(),
    cause: z.string(),
    detail: detailSchema,
    endedBy: z.string(),
    definitionID: z.string().nullable(),
    triggerKey: z.string().nullable(),
    carriesRunID: z.string().nullable(),
    used: usedSchema,
    reportID: z.string(),
    reportTo: z.string().nullable(),
    delivery: z.enum(['wake', 'next_turn', 'kept']),
  }),
);
