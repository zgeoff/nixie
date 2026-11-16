import { z } from 'zod';
import type { Override } from '../types';

export const overrideSchema = z.strictObject({
  period: z.enum(['day', 'month']),
  start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
  limit: z.strictObject({
    dollars: z.number().positive(),
    tokens: z.number().positive(),
  }),
}) satisfies z.ZodType<Override>;
