import { z } from 'zod';
import { routeCountSchema } from './route-count-schema';
import { sandboxLimitSchema } from './sandbox-limit-schema';
import { sandboxNameSchema } from './sandbox-name-schema';

// the store of version 3, which counted routes only and named no provider in a refusal
const routeRefusalSchema = z.strictObject({
  counter: z.enum(['route_day', 'route_month', 'sandbox']),
  route: z.string(),
  atMs: z.number(),
});

const routeSandboxSchema = z.strictObject({
  micros: z.int().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: sandboxLimitSchema.nullable(),
  lastRefusal: routeRefusalSchema.nullable().default(null),
  limitRevision: z.int().nonnegative().default(0),
});

const routePeriodsSchema = z.strictObject({ day: routeCountSchema, month: routeCountSchema });

export const version3StoreSchema = z.strictObject({
  version: z.literal(3),
  lost: z.literal(true).optional(),
  routes: z.record(z.string(), routePeriodsSchema),
  sandboxes: z.record(sandboxNameSchema, routeSandboxSchema),
  lastLimitRevision: z.int().nonnegative().exactOptional(),
});
