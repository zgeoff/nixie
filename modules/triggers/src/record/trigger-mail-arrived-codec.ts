import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const matchSchema = z.object({
  ruleID: z.string(),
  targetTaskID: z.string(),
  isHeld: z.boolean(),
});

const mailArrivedSchema = z.object({
  source: z.string(),
  dedupeKey: z.string(),
  mailbox: z.string(),
  messageID: z.string(),
  threadID: z.string(),
  receivedAt: z.number(),
  matches: z.array(matchSchema),
});

// One arrival that matched a rule. Each match says whether its target woke with the arrival or the
// match was held for a later wake. The sender and the subject sit in the erasable fields, and the
// core deletes the record's key once no held match names it.
export const triggerMailArrivedCodec = defineRecordCodec('trigger.mail_arrived', mailArrivedSchema);
export const mailArrivedFieldsSchema = z.object({ from: z.string(), subject: z.string() });
