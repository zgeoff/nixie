import { z } from 'zod';
import type { PeriodStore } from '../types';
import { measuresSchema } from './measures-schema';
import { sandboxNameSchema } from './sandbox-name-schema';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const routeCountSchema = z.strictObject({
  start: isoDateSchema,
  resetsAt: z.iso.datetime(),
  micros: z.int().nonnegative(),
  raise: z.number().nonnegative().nullable(),
  trippedAt: z.iso.datetime().nullable(),
});

const refusalSchema = z.strictObject({
  counter: z.enum(['route_day', 'route_month', 'sandbox']),
  route: z.string(),
  atMs: z.number(),
});

const sandboxCountSchema = z.strictObject({
  micros: z.int().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: measuresSchema.nullable(),
  lastRefusal: refusalSchema.nullable().default(null),
});

const periodStoreSchema = z.strictObject({
  version: z.literal(3),
  lost: z.literal(true).optional(),
  routes: z.record(z.string(), z.strictObject({ day: routeCountSchema, month: routeCountSchema })),
  sandboxes: z.record(sandboxNameSchema, sandboxCountSchema),
});

export function parsePeriodStore(stored: unknown): PeriodStore {
  const { lost, ...rest } = periodStoreSchema.parse(stored);

  return { ...rest, lost: lost === true };
}
