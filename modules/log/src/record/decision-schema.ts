import { z } from 'zod';
import type { Decision } from '../types';

const legacyPermissionSchema = z.enum(['owner', 'reply_target', 'known_contact', 'task', 'rule']);

const permissionSchema = z.union([
  legacyPermissionSchema,
  z.object({
    by: z.literal('place'),
    placeID: z.string(),
    trust: z.enum(['known', 'read', 'act', 'self']),
  }),
  z.object({ by: z.literal('reading') }),
  z.object({ by: z.literal('reply_target') }),
  z.object({ by: z.literal('task') }),
  z.object({ by: z.literal('rule'), ruleID: z.string() }),
]);

const destinationSchema = z.object({
  destination: z.string(),
  permission: permissionSchema.nullable(),
});

const contextSchema = z.enum(['conversation', 'task', 'coding']);
const sourceSchema = z.enum(['owner', 'own_data', 'task', 'outside']);

export const decisionSchema = z.object({
  outcome: z.enum(['allow', 'ask', 'deny', 'gate']),
  stage: z.number(),
  rule: z.object({ id: z.string(), revision: z.number() }).nullable(),
  destinations: destinationSchema.array().exactOptional(),
  consent: z.object({ messageSequence: z.number(), verdict: z.string() }).exactOptional(),
  autoMode: z
    .object({ verdict: z.string(), reason: z.string(), inputsHash: z.string() })
    .exactOptional(),
  ruleOthers: z.string().array().exactOptional(),
  cause: z
    .enum([
      'direct_request',
      'repeat',
      'outside_steering',
      'always_ask',
      'ask_rule',
      'no_rule',
      'condition_error',
    ])
    .exactOptional(),
  conditionErrors: z
    .object({ ruleID: z.string(), revision: z.number(), code: z.string() })
    .array()
    .exactOptional(),
  defect: z.enum(['direct_request', 'repeat']).exactOptional(),
  permissions: permissionSchema.nullable().array().exactOptional(),
  places: z.object({ placeID: z.string(), shortID: z.string() }).array().exactOptional(),
  consentCheck: z
    .object({
      messageSequences: z.number().array(),
      codeCheck: z.enum(['pass', 'fail']),
      checker: z.enum(['yes', 'no', 'unsure', 'unreachable']),
    })
    .exactOptional(),
  fault: z.enum(['threw', 'timed_out']).exactOptional(),
  lift: z
    .object({ ruleID: z.string(), budgetID: z.string(), amountMicros: z.number() })
    .exactOptional(),
  inputs: z
    .object({
      toolList: z.string().array(),
      context: contextSchema,
      definitionID: z.string().nullable(),
      sources: sourceSchema.array(),
      turnMessageSequence: z.number().nullable(),
      onBehalfOf: z.number().array(),
      effects: z.string().array().exactOptional(),
      placeEffects: z.string().array().exactOptional(),
    })
    .exactOptional(),
}) satisfies z.ZodType<Decision>;
