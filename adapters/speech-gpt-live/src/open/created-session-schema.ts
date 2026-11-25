import { z } from 'zod';

const sessionSchema = z.object({ id: z.string() });
const transportSchema = z.object({ sdp: z.string() });

export const createdSessionSchema = z.object({
  session: sessionSchema,
  transport: transportSchema,
});
