import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';
import { ruleContexts } from '../rule/rule-contexts';
import { ruleSources } from '../rule/rule-sources';
import { effectNames } from '../utils/effect-names';

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

    // Only an ask with the cause no_rule holds the facts below, and a record without them never
    // joins a gap group. None is a destination or an argument value.
    groupHash: z.string().exactOptional(),
    context: z.enum(ruleContexts).exactOptional(),
    definitionID: z.string().nullable().exactOptional(),
    sources: z.enum(ruleSources).array().exactOptional(),
    content: z.string().array().exactOptional(),

    // the action a reopening proposal asks about, when it is not the proposal's own ID
    actionID: z.string().exactOptional(),
  }),
);
