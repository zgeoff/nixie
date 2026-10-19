import { z } from 'zod';

// skills.lock.json: each vendored skill's lock entry by its name, which holds where the skill came
// from, the full commit it was copied at, and the content hash of its folder
export const skillsLockSchema = z.record(
  z.string(),
  z.strictObject({
    source: z.url({ protocol: /^https$/u }),
    path: z.string().min(1),
    commit: z.string().regex(/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/u, 'use the full commit SHA'),
    contentHash: z.string().regex(/^[0-9a-f]{64}$/u, 'use the hex SHA-256 of the skill folder'),
  }),
);
