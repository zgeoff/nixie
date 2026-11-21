import { z } from 'zod';

export const hostSessionSchema = z.object({
  sessionID: z.string(),
  deviceName: z.string(),
  createdAt: z.date(),
  lastUsedAt: z.date(),
});
