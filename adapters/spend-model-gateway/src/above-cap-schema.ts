import { z } from 'zod';

export const aboveCapSchema = z.looseObject({
  error: z.literal('above_cap'),
  route: z.string(),
  cap: z.number(),
});
