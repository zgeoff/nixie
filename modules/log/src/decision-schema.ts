import { z } from 'zod';
import type { Decision } from './types';

const destinationSchema = z.object({ destination: z.string(), permission: z.string().nullable() });
const permissionSchema = z.enum(['owner', 'reply_target', 'known_contact', 'job', 'rule']);
const contextSchema = z.enum(['conversation', 'task', 'job', 'coding']);
const sourceSchema = z.enum(['owner', 'own_data', 'task', 'outside']);

export const decisionSchema = z.object({
  outcome: z.enum(['allow', 'ask', 'deny']),
  stage: z.number(),
  rule: z.object({ id: z.string(), revision: z.number() }).nullable(),
  destinations: destinationSchema.array().exactOptional(),
  consent: z.object({ messageSequence: z.number(), verdict: z.string() }).exactOptional(),
  autoMode: z
    .object({ verdict: z.string(), reason: z.string(), inputsHash: z.string() })
    .exactOptional(),
  ruleOthers: z.string().array().exactOptional(),
  cause: z
    .enum(['direct_request', 'repeat', 'outside_steering', 'always_ask', 'ask_rule', 'no_rule'])
    .exactOptional(),
  defect: z.enum(['direct_request', 'repeat']).exactOptional(),
  permissions: permissionSchema.nullable().array().exactOptional(),
  consentCheck: z
    .object({
      messageSequences: z.number().array(),
      codeCheck: z.enum(['pass', 'fail']),
      checker: z.enum(['yes', 'no', 'unsure', 'unreachable']),
    })
    .exactOptional(),
  fault: z.enum(['threw', 'timed_out']).exactOptional(),
  inputs: z
    .object({
      toolList: z.string().array(),
      context: contextSchema,
      definitionID: z.string().nullable(),
      sources: sourceSchema.array(),
      turnMessageSequence: z.number().nullable(),
      onBehalfOf: z.number().array(),
    })
    .exactOptional(),
}) satisfies z.ZodType<Decision>;
