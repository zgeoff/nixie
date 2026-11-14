import { z } from 'zod';

export const actionProposalSchema = z.object({
  proposalID: z.string(),
  tool: z.string(),
  effects: z.array(z.string()),
  cause: z.enum([
    'outside_steering',
    'always_ask',
    'ask_rule',
    'no_rule',
    'direct_request',
    'repeat',
  ]),
  sentence: z.string(),
  destinations: z.array(z.string()),
  createdAt: z.date(),
  lapseAt: z.date(),
});
