import { z } from 'zod';
import type { CompactionSettings } from './types';

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

const defaultHeadsUp = 0.7;

function pickDefaultHeadsUp(threshold: number): number {
  return threshold > defaultHeadsUp ? defaultHeadsUp : threshold * (7 / 8);
}
