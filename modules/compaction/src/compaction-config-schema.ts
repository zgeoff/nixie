import { z } from 'zod';
import type { CompactionSettings } from './types';

// The compaction section of the deployment configuration: the shares of the profile's window at
// which a turn's end compacts the session and warns the model first, and the summary's token cap.
export const compactionConfigSchema = z
  .strictObject({
    threshold: z.number().gt(0).max(1).default(0.8),
    heads_up: z.number().gt(0).max(1).optional(),
    summary_tokens: z.int().min(100).default(2000),
  })
  .refine((config) => config.heads_up === undefined || config.heads_up < config.threshold, {
    message: 'heads_up must sit under threshold',
    path: ['heads_up'],
  })
  .transform((config): CompactionSettings => ({
    threshold: config.threshold,
    headsUp: config.heads_up ?? pickDefaultHeadsUp(config.threshold),
    summaryTokens: config.summary_tokens,
  }));

// 0.7 of the window, under the default threshold of 0.8
const defaultHeadsUp = 0.7;

// a threshold at or under the default heads-up keeps the default's ratio to the default threshold,
// so a deployment that lowered its threshold and set no heads-up still starts
function pickDefaultHeadsUp(threshold: number): number {
  return threshold > defaultHeadsUp ? defaultHeadsUp : threshold * (7 / 8);
}
