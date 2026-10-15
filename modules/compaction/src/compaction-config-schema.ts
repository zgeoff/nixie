import { z } from 'zod';
import type { CompactionSettings } from './types';

// The compaction section of the deployment configuration: the share of the profile's window at or
// past which a turn's end compacts the session, and the token cap of the summary the model writes.
export const compactionConfigSchema = z
  .strictObject({
    threshold: z.number().gt(0).max(1).default(0.8),
    summary_tokens: z.int().min(100).default(2000),
  })
  .transform((config): CompactionSettings => ({
    threshold: config.threshold,
    summaryTokens: config.summary_tokens,
  }));
