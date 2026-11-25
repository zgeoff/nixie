import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { wakeMatchSchema } from './wake-match-schema';

const conversationTargetSchema = z.strictObject({ kind: z.literal('conversation') });
const taskTargetSchema = z.strictObject({ kind: z.literal('task'), taskID: z.string() });
const targetSchema = z.union([conversationTargetSchema, taskTargetSchema]);

const wakeRuleSetSchema = z.object({
  ruleID: z.string(),
  shortID: z.string(),
  mailbox: z.literal('mail'),
  match: wakeMatchSchema,
  target: targetSchema,
  targetTaskID: z.string(),
  setBy: z.string(),
  expiresAt: z.number().nullable(),
  windowMs: z.int(),
  origin: z.enum(['tool', 'reply']),
  createdAt: z.number(),
});

// The whole rule. A replace writes it again under the same rule ID. A rule's match sits in plain
// text, as a definition's filter does. It sits on no thread.
export const triggerWakeRuleSetCodec = defineRecordCodec(
  'trigger.wake_rule_set',
  wakeRuleSetSchema,
);
