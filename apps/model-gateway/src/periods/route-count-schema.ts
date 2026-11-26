import { z } from 'zod';

const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u);

export const routeCountSchema = z.strictObject({
  start: isoDateSchema,
  resetsAt: z.iso.datetime(),
  micros: z.int().nonnegative(),
  raise: z.number().nonnegative().nullable(),
  trippedAt: z.iso.datetime().nullable(),
});
