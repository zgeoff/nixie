import { z } from 'zod';

export const spendSetCountOutputSchema = z.union([
  z.object({ state: z.literal('clear') }),
  z.object({ state: z.literal('stopped') }),
  z.object({ error: z.literal('period_ended') }),
  z.object({ error: z.literal('unknown_route') }),
  z.object({ error: z.literal('unknown_provider') }),
  z.object({ error: z.literal('unreachable') }),
]);
