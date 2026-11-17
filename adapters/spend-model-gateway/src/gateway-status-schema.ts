import { z } from 'zod';
import { measuresSchema } from './measures-schema';

const periodSchema = z.looseObject({
  start: z.string(),
  resetsAt: z.string(),
  spent: measuresSchema,
  limit: measuresSchema.nullable(),
  cap: measuresSchema,
});

const limitTripSchema = z.looseObject({
  period: z.enum(['day', 'month']),
  measure: z.enum(['dollars', 'tokens']),
  at: z.string(),
});

const lostTripSchema = z.looseObject({ lost: z.literal(true), at: z.string() });

export const gatewayStatusSchema = z.looseObject({
  zone: z.string(),
  lost: z.boolean(),
  periods: z.looseObject({ day: periodSchema, month: periodSchema }),
  tripped: z.union([limitTripSchema, lostTripSchema]).nullable(),
});
