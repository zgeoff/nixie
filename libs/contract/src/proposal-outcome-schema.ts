import { z } from 'zod';

const closeMatchSchema = z.object({
  itemID: z.string(),
  text: z.string(),
  version: z.int().positive(),
});

export const proposalOutcomeSchema = z.discriminatedUnion('status', [
  z.object({ proposalID: z.string(), status: z.literal('applied') }),
  z.object({ proposalID: z.string(), status: z.literal('rejected') }),
  z.object({
    item: closeMatchSchema,
    proposalID: z.string(),
    status: z.literal('close_match'),
  }),
  z.object({
    cause: z.enum(['lapsed', 'answered', 'moved', 'changed', 'gone']),
    proposalID: z.string(),
    status: z.literal('stale'),
  }),
  z.object({
    code: z.enum([
      'CLIENT_ACTION_ID_REUSED',
      'PINNED_CORE_FULL',
      'RETIREMENT_EDIT',
      'REVISION_TARGET',
      'WRONG_STATE',
    ]),
    proposalID: z.string(),
    status: z.literal('refused'),
  }),
]);
