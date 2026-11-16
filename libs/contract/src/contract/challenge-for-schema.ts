import { z } from 'zod';
import { choiceSchema } from './choice-schema';

// The check a passkey assertion answers, so an assertion for one answer never approves another.
export const challengeForSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('answer'),
    proposalID: z.string().min(1).max(200),
    actionHash: z.string().min(1),
    choice: choiceSchema,
    ruleHash: z.string().optional(),
  }),
  z.object({
    kind: z.literal('unknown_outcome'),
    actionID: z.string().min(1).max(200),
    choice: z.literal('retry'),
  }),
  z.object({ kind: z.literal('register') }),
  z.object({ kind: z.literal('revoke'), passkeyID: z.string().min(1).max(200) }),
]);
