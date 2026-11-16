import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const triggerFiredKinds = ['schedule', 'at', 'poll'] as const;
const polledSchema = z.array(z.int());
const skippedSchema = z.array(z.string());
const countSchema = z.int().nonnegative();

// One fire of a definition's trigger, written on the thread of the task or the conversation that
// the fire opens a task run on.
export const triggerFiredCodec = defineRecordCodec(
  'trigger.fired',
  z.object({
    definitionID: z.string(),
    definitionHash: z.string(),
    source: z.string(),
    dedupeKey: z.string(),
    kind: z.enum(triggerFiredKinds),
    polled: polledSchema.exactOptional(),
    scheduledFor: z.string(),
    firedAt: z.string(),
    isCatchUp: z.boolean(),
    skipped: skippedSchema,
    skippedCount: countSchema,
  }),
);
