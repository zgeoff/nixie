import { z } from 'zod';
import type { Overrides } from '../types';

// the day limit of each route, by route ID
export const overrideSchema = z.record(
  z.string().min(1),
  z.strictObject({
    start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    dollars: z.number().positive(),
  }),
) satisfies z.ZodType<Overrides>;
