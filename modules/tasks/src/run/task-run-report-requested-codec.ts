import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskRunReportRequestedCodec = defineRecordCodec(
  'task.run_report_requested',
  z.object({
    taskID: z.string(),
    runID: z.string(),
    stepKey: z.string(),
    reportID: z.string(),
  }),
);
