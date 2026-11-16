import { z } from 'zod';

export const measuresSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative(),
});
