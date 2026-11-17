import { z } from 'zod';

const triple = z.object({ dollars: z.number(), tokens: z.number(), turns: z.number() });

// What the spending stop is. A trip also holds the limits in force, the counts and the caps of its
// period, so a client can offer a raise.
export const spendStopSchema = z.discriminatedUnion('state', [
  z.object({ state: z.literal('clear') }),
  z.object({ state: z.literal('unreachable') }),
  z.object({ state: z.literal('lost') }),
  z.object({
    state: z.literal('tripped'),
    period: z.enum(['day', 'month']),
    start: z.string(),
    measure: z.enum(['dollars', 'tokens', 'turns']),
    limit: z.number(),
    spent: z.number(),
    at: z.date(),
    resetsAt: z.date(),
    canRaise: z.boolean(),
    limits: triple,
    used: triple,
    cap: triple,
  }),
]);

export const spendRaiseInputSchema = z.object({
  // the ISO date of the day, in the default zone, that the raise is for
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),

  // the totals that the day's limits reach, never the size of the raise
  dollars: z.number().positive(),
  tokens: z.int().positive(),
  turns: z.int().positive(),
});

export const spendRaiseOutputSchema = z.union([
  z.object({ state: z.literal('clear') }),
  z.object({ state: z.literal('stopped') }),
  z.object({ error: z.literal('above_cap'), cap: triple }),
  z.object({ error: z.literal('period_ended') }),
  z.object({ error: z.literal('unreachable') }),
]);

export const spendStopStandsError = {
  message: 'Model spending is stopped, and nixie resumes when the stop clears',
  status: 409,
} as const;
