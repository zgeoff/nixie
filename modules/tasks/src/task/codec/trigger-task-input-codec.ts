import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

// An event of a source that names its task, written by the trigger core. The event itself sits in
// the record's erasable fields, so a forget destroys it. The record is an inbox record only when
// `wake` is true.
const factsSchema = z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()]));

export const triggerTaskInputCodec = defineRecordCodec(
  'trigger.task_input',
  z.object({
    taskID: z.string(),
    source: z.string(),
    dedupeKey: z.string(),
    occurredAt: z.string(),
    hop: z.int(),
    wake: z.boolean(),

    // what a projection of the source reads: the facts of the event that are no person's text
    facts: factsSchema,
  }),
);
