import { z } from 'zod';

export interface ErasureConfig {
  readonly stuckAfterMs: number;
}

const msPerMinute = 60_000;

// A forget that is still open this long after it started is stuck: nixie raises an alert for it
// each time it retries the forget.
export const erasureConfigSchema = z
  .strictObject({
    stuck_after_minutes: z.number().positive().default(5),
  })
  .transform((config): ErasureConfig => ({
    stuckAfterMs: config.stuck_after_minutes * msPerMinute,
  }));
