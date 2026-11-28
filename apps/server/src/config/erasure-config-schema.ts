import { z } from 'zod';

export interface ErasureConfig {
  readonly stuckAfterMs: number;
  readonly expireAfterMs: number;
}

const msPerMinute = 60_000;
const msPerDay = 86_400_000;

// A forget that is still open this long after it started is stuck: nixie raises an alert for it
// each time it retries the forget. A payload that has aged past expire_after_days expires.
export const erasureConfigSchema = z
  .strictObject({
    stuck_after_minutes: z.number().positive().default(5),
    expire_after_days: z.number().positive().default(365),
  })
  .transform((config): ErasureConfig => ({
    stuckAfterMs: config.stuck_after_minutes * msPerMinute,
    expireAfterMs: config.expire_after_days * msPerDay,
  }));
