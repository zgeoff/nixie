import { z } from 'zod';

export const serverFactsSchema = z.object({
  url: z.string(),
  clientID: z.string(),
  scope: z.string(),
  privateRange: z.string().nullable(),
});
