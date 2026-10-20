import { z } from 'zod';

const closeMatchSchema = z.object({
  itemID: z.string(),
  text: z.string(),
  version: z.int().positive(),
});

// The outcome of one answer. A stale answer met a proposal that lapsed, was answered, changed or is
// gone, or an item that moved on, and wrote nothing, as does a refusal. A close match holds an
// approval for an active item that states the same fact.
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
