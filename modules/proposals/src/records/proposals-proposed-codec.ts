import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const proposalsProposedCodec = defineRecordCodec(
  'proposals.proposed',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    family: z.enum(['action', 'memory', 'skill', 'rule_change', 'mcp', 'prompt']),
    kind: z.enum(['action', 'memory_write', 'internal_change']),
    cause: z.string(),
    riskClass: z.enum(['routine', 'always_ask', 'lifting']),
    actionHash: z.string(),
    ruleHash: z.string().nullable(),
    thread: z.string().nullable(),
    taskID: z.string().nullable(),
    lapsesAt: z.number(),
    deadlineAt: z.number().nullable(),
    sameThing: z.string().nullable().default(null),
    replaces: z.string().nullable(),
  }),
);
