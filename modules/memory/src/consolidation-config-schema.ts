import { z } from 'zod';

const dayMs = 24 * 60 * 60 * 1000;

export interface ConsolidationConfig {
  readonly periodMs: number;
  readonly maxChanges: number;
  readonly itemListTokens: number;
  readonly topItems: number;
  readonly lapseMs: number;
  readonly retryMs: number;
}

// The memory consolidation section of the deployment configuration: how often the consolidator
// runs, the most changes one diff holds, the item list's token budget, how many items a recall
// returns, how long a change waits for your answer, and how long a failed run waits to try again.
export const consolidationConfigSchema = z
  .strictObject({
    period_days: z.number().positive().default(7),
    max_changes: z.int().positive().max(30).default(30),
    item_list_tokens: z.int().positive().default(24_000),
    top_items: z.int().positive().max(100).default(20),
    lapse_days: z.number().positive().default(7),
    retry_minutes: z.number().positive().default(60),
  })
  .transform((config): ConsolidationConfig => ({
    periodMs: Math.round(config.period_days * dayMs),
    maxChanges: config.max_changes,
    itemListTokens: config.item_list_tokens,
    topItems: config.top_items,
    lapseMs: Math.round(config.lapse_days * dayMs),
    retryMs: Math.max(1, Math.round(config.retry_minutes * 60_000)),
  }));

// The consolidation section as the deployment configuration writes it, before the defaults apply.
export type ConsolidationConfigInput = z.input<typeof consolidationConfigSchema>;
