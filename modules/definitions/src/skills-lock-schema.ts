import { z } from 'zod';

export const skillsLockSchema = z.record(
  z.string(),
  z.strictObject({
    source: z.url({ protocol: /^https$/u }),
    path: z.string().min(1),
    commit: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u, 'use the full commit SHA'),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/u, 'use the hex SHA-256 of the skill folder'),
  }),
);
