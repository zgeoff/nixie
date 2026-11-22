import { z } from 'zod';

export const sessionsSchema = z.array(
  z.object({ deviceName: z.string(), createdAt: z.string(), lastUsedAt: z.string() }),
);
