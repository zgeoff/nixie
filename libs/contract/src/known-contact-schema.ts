import { z } from 'zod';

export const knownContactSchema = z.object({
  contactID: z.string(),
  name: z.string().nullable(),
  destination: z.string().nullable(),
  markedAt: z.date(),
});
