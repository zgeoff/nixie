import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { reportShapeSchema } from '../report/report-shape-schema';
import { runLimitsSchema } from './run-limits-schema';

const originSchema = z.object({ kind: z.string(), sequence: z.int().nullable() });

const reportSchema = z.object({
  mode: z.enum(['wake', 'next_turn', 'none']),
  target: z.string().nullable(),
});

export const taskRunOpenedCodec = defineRecordCodec(
  'task.run_opened',
  z.object({
    taskID: z.string(),
    runID: z.string(),
    openedByStep: z.string(),
    origin: originSchema,
    definitionID: z.string().nullable(),
    definitionHash: z.string().nullable(),
    triggerKey: z.string().nullable(),
    carriesRunID: z.string().nullable(),
    briefID: z.string().nullable(),
    report: reportSchema,
    reportShape: reportShapeSchema.nullable(),
    limits: runLimitsSchema,
  }),
);
