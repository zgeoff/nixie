import { z } from 'zod';

export const sandboxLimitSchema = z.strictObject({
  dollars: z.number().nonnegative(),
  tokens: z.number().nonnegative().exactOptional(),
});
