import { z } from 'zod';
import type { MemoryIndexConfig } from '../index-block/default-index-settings';
import { defaultIndexSettings } from '../index-block/default-index-settings';
import { defaultTurnSettings } from '../turn/default-turn-settings';
import type { TurnMemorySettings } from '../turn/types';
import { defaultGateLimits } from './default-gate-limits';
import type { GateLimits } from './gate-context';

const dayMs = 24 * 60 * 60 * 1000;
const countSchema = z.number().int().positive();

export interface MemoryConfig {
  readonly limits: GateLimits;
  readonly checkerTimeoutMs: number;
  readonly pinnedCoreTokens: number;
  readonly turn: TurnMemorySettings;
  readonly rebuildTokens: number;
  readonly index: MemoryIndexConfig;
}

const minIndexTokens = 3000;

// 0 omits the block, and a budget below 3000 could not hold the block's opening and closing lines.
const indexTokensSchema = z
  .int()
  .nonnegative()
  .refine((tokens) => tokens === 0 || tokens >= minIndexTokens, {
    message: `must be 0 or at least ${minIndexTokens}`,
  });

export const memoryConfigSchema = z
  .strictObject({
    evidence_window: countSchema.default(defaultGateLimits.evidenceWindow),
    proposal_lapse_days: countSchema.default(defaultGateLimits.proposalLapseMs / dayMs),
    proposal_cap: countSchema.default(defaultGateLimits.proposalCap),
    close_match_score: z.number().min(0).max(1).default(defaultGateLimits.closeMatchScore),

    // A live check took about 9 s, so 20 s keeps a slow check inside the timeout.
    checker_timeout_ms: countSchema.default(20_000),
    pinned_core_tokens: z.int().positive().default(2000),
    trigger_items: z.int().nonnegative().max(20).default(defaultTurnSettings.trigger.items),

    // On invented items with the shipped encoder, near misses scored up to 6.32 in an index of 52
    // phrases, and matches to the phrase meant scored from 3.75. The floor sits above the near
    // misses, so a deployment with few phrases matches by meaning.
    trigger_min_score: z.number().nonnegative().default(defaultTurnSettings.trigger.minScore),

    // A near miss reached 0.56, above the 0.3 of a search that a request asks for, and the
    // matches that meant their phrase scored from 0.43. The floor sits above the near misses.
    trigger_min_similarity: z
      .number()
      .min(-1)
      .max(1)
      .default(defaultTurnSettings.trigger.minSimilarity),
    rebuild_tokens: z.int().nonnegative().default(30_000),
    index_tokens: indexTokensSchema.default(defaultIndexSettings.tokens),
    index_open_topic_items: countSchema.default(defaultIndexSettings.openTopicItems),
    index_item_order: z.literal('newest-first').default(defaultIndexSettings.itemOrder),
    index_topic_page: countSchema.default(defaultIndexSettings.topicPage),
  })
  .transform((config): MemoryConfig => ({
    limits: {
      evidenceWindow: config.evidence_window,
      proposalLapseMs: config.proposal_lapse_days * dayMs,
      proposalCap: config.proposal_cap,
      closeMatchScore: config.close_match_score,
    },
    checkerTimeoutMs: config.checker_timeout_ms,
    pinnedCoreTokens: config.pinned_core_tokens,
    turn: {
      trigger: {
        items: config.trigger_items,
        minScore: config.trigger_min_score,
        minSimilarity: config.trigger_min_similarity,
      },
    },
    rebuildTokens: config.rebuild_tokens,
    index: {
      tokens: config.index_tokens,
      openTopicItems: config.index_open_topic_items,
      itemOrder: config.index_item_order,
      topicPage: config.index_topic_page,
    },
  }));
