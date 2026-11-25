import { z } from 'zod';

// A route that reached its day or month limit in US dollars. Only the work on the route waits, and
// nixie goes on.
const routeTripSchema = z.object({
  route: z.string(),
  period: z.enum(['day', 'month']),
  start: z.string(),
  limit: z.number(),
  spent: z.number(),
  at: z.date(),
  resetsAt: z.date(),
  canRaise: z.boolean(),

  // the most a raise of the day reaches, null on the month
  cap: z.number().nullable(),
});

const routes = z.array(routeTripSchema);

// What the spending stop is, and each route that waits at its own limit. A trip of the turn count
// also holds the limit in force, the count and the cap, so a client can offer a raise.
export const spendStopSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('clear'), routes }),
  z.object({ state: z.literal('unreachable'), routes }),
  z.object({ state: z.literal('lost'), routes }),
  z.object({
    state: z.literal('tripped'),
    period: z.enum(['day', 'month']),
    start: z.string(),
    measure: z.literal('turns'),
    limit: z.number(),
    spent: z.number(),
    at: z.date(),
    resetsAt: z.date(),
    canRaise: z.boolean(),
    cap: z.number(),
    routes,
  }),
]);

const periodCountSchema = z.object({
  dollars: z.number(),

  // the limit in force in US dollars, null on a route with none
  limit: z.number().nullable(),
  tripped: z.boolean(),
});

// Each route's day and month count in US dollars. The display holds the currency that the client
// shows beside each figure, with the rate of one US dollar in it, and is null when the config sets
// none or no read has given a rate yet.
const routeCountsSchema = z.object({
  route: z.string(),
  day: periodCountSchema,
  month: periodCountSchema,
});

const displaySchema = z.object({ currency: z.string(), rate: z.number().positive() });

export const spendCountsSchema = z.object({
  routes: z.array(routeCountsSchema),
  display: displaySchema.nullable(),
});

export const spendRaiseInputSchema = z.object({
  // the ISO date of the day, in the default zone, that the raise is for
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),

  // the route whose dollars the raise lifts, with the dollars
  route: z.string().min(1).optional(),
  dollars: z.number().positive().optional(),

  // the turns that the day's limit reaches
  turns: z.int().positive().optional(),
});

export const spendRaiseOutputSchema = z.union([
  z.object({ state: z.literal('clear') }),
  z.object({ state: z.literal('stopped') }),
  z.object({
    error: z.literal('above_cap'),
    measure: z.enum(['dollars', 'turns']),
    route: z.string().nullable(),
    cap: z.number(),
  }),
  z.object({ error: z.literal('period_ended') }),
  z.object({ error: z.literal('unknown_route') }),
  z.object({ error: z.literal('unreachable') }),
]);

export const spendStopStandsError = {
  message: 'Model spending is stopped, and nixie resumes when the stop clears',
  status: 409,
} as const;
