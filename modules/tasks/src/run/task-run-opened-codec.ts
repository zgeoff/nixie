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

    // where the task run's dollars come from: the gateway's count of its sandboxes, or the runner's
    // pricing of the guest's call frames. A task run that began before the meter was recorded has
    // none, and keeps the meter that priced its records.
    meter: z.enum(['gateway', 'records']).exactOptional(),
  }),
);
