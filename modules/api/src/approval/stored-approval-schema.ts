import { z } from 'zod';

const stateSchema = z.enum(['pending', 'deferred', 'approved', 'declined', 'lapsed', 'withdrawn']);
const hashesSchema = z.object({ actionHash: z.string(), ruleHash: z.string().nullable() });
const ruleRefSchema = z.object({ id: z.string(), revision: z.number() });
const closeMatchSchema = z.object({ itemID: z.string(), text: z.string(), version: z.number() });

const approvedSchema = z.object({
  proposalID: z.string(),
  state: z.literal('approved'),
  rule: ruleRefSchema.exactOptional(),
});

const closedSchema = z.object({ proposalID: z.string(), state: z.enum(['declined', 'deferred']) });

const pendingSchema = z.object({
  proposalID: z.string(),
  state: z.literal('pending'),
  closeMatch: closeMatchSchema,
});

const answeredSchema = z.object({
  status: z.literal('answered'),
  result: z.discriminatedUnion('state', [approvedSchema, closedSchema, pendingSchema]),
});

const refusalSchema = z.discriminatedUnion('error', [
  z.object({ error: z.literal('NOT_FOUND') }),
  z.object({ error: z.literal('CLOSED'), state: stateSchema }),
  z.object({ error: z.literal('CONFLICT'), current: hashesSchema }),
  z.object({ error: z.literal('NOT_ALLOWED'), reason: z.string() }),
]);

const refusedSchema = z.object({ status: z.literal('refused'), refusal: refusalSchema });

// What a client action keeps of an answer, so a retry gets the same answer or refusal.
export const storedApprovalSchema = z.discriminatedUnion('status', [answeredSchema, refusedSchema]);
