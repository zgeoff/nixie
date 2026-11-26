import { z } from 'zod';

const periodSchema = z.looseObject({
  start: z.string(),
  resetsAt: z.string(),
  dollars: z.number(),
  limit: z.number().nullable(),
  cap: z.number().nullable(),
  tripped: z.boolean(),
  sinceMs: z.number().nullable(),
});

const periodsSchema = z.looseObject({ day: periodSchema, month: periodSchema });

const routeSchema = z.looseObject({
  provider: z.string().default(''),
  day: periodSchema,
  month: periodSchema,
});

// An older gateway sends no providers and no provider on a route, which read as none and as the
// empty provider.
export const gatewayStatusSchema = z.looseObject({
  zone: z.string(),
  lost: z.boolean(),
  providers: z.record(z.string(), periodsSchema).default({}),
  routes: z.record(z.string(), routeSchema),
});
