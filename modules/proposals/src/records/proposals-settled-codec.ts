import { defineRecordCodec } from '@heynixie/log';
import { z } from 'zod';

export const proposalsSettledCodec = defineRecordCodec(
  'proposals.settled',
  z.object({
    proposalID: z.string(),
    shortID: z.string(),
    family: z.enum(['action', 'memory', 'skill', 'rule_change', 'mcp', 'prompt']),
    outcome: z.enum(['approved', 'declined', 'lapsed', 'withdrawn']),
    answeredBy: z.string().nullable(),
    usedBy: z.string().nullable(),
    detail: z.string().nullable(),
    task: z.string().nullable(),
    replaced: z.string().nullable().default(null),

    // true when the proposer's own call withdrew it, so its result already holds the outcome
    byProposer: z.boolean().default(false),
  }),
);
