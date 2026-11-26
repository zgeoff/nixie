import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const taskMeterReadReasons = [
  'run_start',
  'step_start',
  'step_end',
  'worker_end',
  'run_end',
] as const;

// One read of a sandbox's count of model spend for a task run, in whole micros of a US dollar. The
// count is the gateway's for a sandbox it counts, and the runner's own tally of the guest's priced
// calls for a task run that has no gateway.
export const taskMeterReadCodec = defineRecordCodec(
  'task.meter_read',
  z.object({
    taskRunID: z.string(),
    sandbox: z.string(),
    reason: z.enum(taskMeterReadReasons),
    countMicros: z.int().nonnegative(),
  }),
);

export type TaskMeterReadReason = (typeof taskMeterReadReasons)[number];
