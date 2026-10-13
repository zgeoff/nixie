import { z } from 'zod';

// The memory writer section of the deployment configuration: the batch size and its token budget,
// the idle and age triggers, the pace, the item list's budget, the proposal cap, and the backoff,
// which doubles from its first wait up to the maximum.
export const writerConfigSchema = z
  .strictObject({
    batch_messages: z.int().positive().default(4),
    batch_tokens: z.int().positive().default(12_000),
    idle_minutes: z.number().positive().default(5),
    max_age_minutes: z.number().positive().default(20),
    batches_per_hour: z.int().positive().default(300),
    item_list_tokens: z.int().positive().default(8000),
    top_items: z.int().positive().max(100).default(20),
    proposal_cap: z.int().positive().default(10),
    first_backoff_seconds: z.number().positive().default(30),
    max_backoff_minutes: z.number().positive().default(60),
  })
  .transform((config): WriterConfig => ({
    batchMessages: config.batch_messages,
    batchTokens: config.batch_tokens,
    idleMs: Math.round(config.idle_minutes * 60_000),
    maxAgeMs: Math.round(config.max_age_minutes * 60_000),
    paceMs: Math.ceil(3_600_000 / config.batches_per_hour),
    itemListTokens: config.item_list_tokens,
    topItems: config.top_items,
    proposalCap: config.proposal_cap,
    firstBackoffMs: Math.max(1, Math.round(config.first_backoff_seconds * 1000)),
    maxBackoffMs: Math.max(1, Math.round(config.max_backoff_minutes * 60_000)),
  }));

// The writer section as the deployment configuration writes it, before the defaults apply.
export type WriterConfigInput = z.input<typeof writerConfigSchema>;

export interface WriterConfig {
  readonly batchMessages: number;
  readonly batchTokens: number;
  readonly idleMs: number;
  readonly maxAgeMs: number;

  // the least time from one batch to the next, from the limit of batches an hour
  readonly paceMs: number;
  readonly itemListTokens: number;
  readonly topItems: number;
  readonly proposalCap: number;
  readonly firstBackoffMs: number;
  readonly maxBackoffMs: number;
}
