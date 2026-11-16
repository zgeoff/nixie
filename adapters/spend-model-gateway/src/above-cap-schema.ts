import { z } from 'zod';
import { measuresSchema } from './measures-schema';

export const aboveCapSchema = z.looseObject({
  error: z.literal('above_cap'),
  period: z.enum(['day', 'month']).optional(),
  cap: measuresSchema,
});
