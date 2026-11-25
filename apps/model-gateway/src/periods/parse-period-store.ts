import { z } from 'zod';
import type { PeriodStore } from '../types';
import { measuresSchema } from './measures-schema';
import { sandboxNameSchema } from './sandbox-name-schema';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

const periodCountSchema = z.strictObject({
  start: isoDateSchema,
  resetsAt: z.iso.datetime().nullable().default(null),
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: measuresSchema.nullable(),
  raise: measuresSchema.nullable(),
  trippedAt: z.iso.datetime().nullable(),
});

const sandboxCountSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
  limit: measuresSchema.nullable(),
});

const periodStoreSchema = z.strictObject({
  version: z.literal(2),
  lost: z.literal(true).optional(),
  periods: z.strictObject({ day: periodCountSchema, month: periodCountSchema }),
  sandboxes: z.record(sandboxNameSchema, sandboxCountSchema),
});

export function parsePeriodStore(stored: unknown): PeriodStore {
  const { lost, ...rest } = periodStoreSchema.parse(stored);

  return { ...rest, lost: lost === true };
}
