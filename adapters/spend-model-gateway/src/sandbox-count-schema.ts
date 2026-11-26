import { z } from 'zod';

const refusalCounterSchema = z.enum([
  'route_day',
  'route_month',
  'provider_day',
  'provider_month',
  'sandbox',
]);

// A refusal that an older gateway stored names no provider, which reads as the empty provider
export const sandboxCountSchema = z.looseObject({
  dollars: z.number(),
  tokens: z.number(),
  tripped: z.boolean(),
  lastRefusal: z
    .looseObject({
      counter: refusalCounterSchema,
      route: z.string(),
      provider: z.string().default(''),
      atMs: z.number(),
    })
    .nullable(),
  limitRevision: z.int().nonnegative(),
});
