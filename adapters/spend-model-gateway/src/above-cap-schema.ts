import { z } from 'zod';

export const aboveCapSchema = z.looseObject({
  error: z.literal('above_cap'),
  route: z.string().nullable().default(null),
  provider: z.string().nullable().default(null),
  cap: z.number(),
});
