import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

const releasedSchema = z.array(z.int());

const wakeRuleEndedSchema = z.object({
  ruleID: z.string(),
  reason: z.enum(['cancelled', 'task_ended', 'connection_forgotten']),
  released: releasedSchema,
});

// A rule that ended. `released` holds the sequences of the held arrivals it drops: none for a
// cancelled rule, whose held matches still flush.
export const triggerWakeRuleEndedCodec = defineRecordCodec(
  'trigger.wake_rule_ended',
  wakeRuleEndedSchema,
);
