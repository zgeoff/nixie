import { z } from 'zod';

export const sandboxCountSchema = z.looseObject({
  dollars: z.number(),
  tokens: z.number(),
  tripped: z.boolean(),
  lastRefusal: z
    .looseObject({
      counter: z.enum(['route_day', 'route_month', 'sandbox']),
      route: z.string(),
      atMs: z.number(),
    })
    .nullable(),
  limitRevision: z.int().nonnegative(),
});
