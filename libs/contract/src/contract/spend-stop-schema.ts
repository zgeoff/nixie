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

// A provider that reached its day or month limit in US dollars. The work on every route of the
// provider waits, and nixie goes on.
const providerTripSchema = z.object({
  provider: z.string(),
  routes: z.array(z.string()),
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
const providers = z.array(providerTripSchema);

// What the spending stop is, each route that waits at its own limit and each provider that waits at
// its limit. A trip of the turn count also holds the limit in force, the count and the cap, so a
// client can offer a raise.
export const spendStopSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('clear'), routes, providers }),
  z.object({ state: z.literal('unreachable'), routes, providers }),
  z.object({ state: z.literal('lost'), routes, providers }),
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
    providers,
  }),
]);

const periodCountSchema = z.object({
  // the ISO date of the period's first day, which a count change names
  start: z.string(),
  dollars: z.number(),

  // the limit in force in US dollars, null on a route with none
  limit: z.number().nullable(),
  tripped: z.boolean(),
});

// Each provider's and each route's day and month count in US dollars. The display holds the
// currency that the client shows beside each figure, with the rate of one US dollar in it, and is
// null when the config sets none or no read has given a rate yet.
const providerCountsSchema = z.object({
  provider: z.string(),
  day: periodCountSchema,
  month: periodCountSchema,
});

const routeCountsSchema = z.object({
  route: z.string(),

  // the provider whose limits bind the route
  provider: z.string(),
  day: periodCountSchema,
  month: periodCountSchema,
});

const displaySchema = z.object({ currency: z.string(), rate: z.number().positive() });

export const spendCountsSchema = z.object({
  providers: z.array(providerCountsSchema),
  routes: z.array(routeCountsSchema),
  display: displaySchema.nullable(),
});

export const spendRaiseInputSchema = z
  .object({
    // the ISO date of the day, in the default zone, that the raise is for
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),

    // the route or the provider whose dollars the raise lifts, never both, with the dollars
    route: z.string().min(1).optional(),
    provider: z.string().min(1).optional(),
    dollars: z.number().positive().optional(),

    // the turns that the day's limit reaches
    turns: z.int().positive().optional(),
  })
  .refine((input) => input.route === undefined || input.provider === undefined, {
    message: 'a raise names a route or a provider, never both',
  });

export const spendRaiseOutputSchema = z.union([
  z.object({ state: z.literal('clear') }),
  z.object({ state: z.literal('stopped') }),
  z.object({
    error: z.literal('above_cap'),
    measure: z.enum(['dollars', 'turns']),
    route: z.string().nullable(),
    provider: z.string().nullable(),
    cap: z.number(),
  }),
  z.object({ error: z.literal('period_ended') }),
  z.object({ error: z.literal('unknown_route') }),
  z.object({ error: z.literal('unknown_provider') }),

  // the route has no limit of its own, so only its provider's limits bind it
  z.object({ error: z.literal('no_route_limit'), route: z.string() }),
  z.object({ error: z.literal('unreachable') }),
  z.object({ error: z.literal('unanswered') }),
]);

export const spendStopStandsError = {
  message: 'Model spending is stopped, and nixie resumes when the stop clears',
  status: 409,
} as const;
