import { z } from 'zod';

export const wakeMatchSchema = z.strictObject({
  from: z.array(z.string()).exactOptional(),
  subject: z.string().exactOptional(),
  thread: z.string().exactOptional(),
});
