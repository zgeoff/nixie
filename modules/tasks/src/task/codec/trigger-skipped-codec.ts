import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const skipReasons = [
  'too_late',
  'catch_up_off',
  'window_closed',
  'still_running',
  'task_held',
] as const;

export type SkipReason = (typeof skipReasons)[number];

const scheduledSchema = z.array(z.string());
const countSchema = z.int().nonnegative();

// The record of fire slots that opened no task run. It wakes nothing.
export const triggerSkippedCodec = defineRecordCodec(
  'trigger.skipped',
  z.object({
    definitionID: z.string(),
    source: z.string(),
    dedupeKey: z.string(),
    scheduledFor: scheduledSchema,
    count: countSchema,
    reason: z.enum(skipReasons),
    recordedAt: z.string(),
  }),
);
