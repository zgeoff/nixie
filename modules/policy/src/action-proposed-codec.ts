import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { effectNames } from './effect-names';

const ruleSchema = z.object({ hash: z.string() });

export const actionProposedCodec = defineRecordCodec(
  'policy.action_proposed',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    callSequence: z.number(),
    tool: z.string(),
    effects: z.enum(effectNames).array(),
    actionHash: z.string(),
    cause: z.enum([
      'direct_request',
      'repeat',
      'outside_steering',
      'always_ask',
      'ask_rule',
      'no_rule',
    ]),

    // The fields below came after the first release, so a record without them reads as routine, with
    // no rule, no task and the default lapse.
    riskClass: z.enum(['routine', 'always_ask', 'lifting']).exactOptional(),
    rule: ruleSchema.nullable().exactOptional(),
    taskID: z.string().nullable().exactOptional(),
    lapsesAt: z.number().exactOptional(),
    deadlineAt: z.number().nullable().exactOptional(),
  }),
);
