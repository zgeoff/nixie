import { z } from 'zod';

export const sandboxCountSchema = z.looseObject({
  dollars: z.number(),
  tokens: z.number(),
  tripped: z.boolean(),
});
