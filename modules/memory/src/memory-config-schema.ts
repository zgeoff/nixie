import { z } from 'zod';
import { defaultGateLimits } from './default-gate-limits';
import type { GateLimits } from './gate-types';

const dayMs = 24 * 60 * 60 * 1000;

const countSchema = z.number().int().positive();

export interface MemoryConfig {
  readonly limits: GateLimits;
  readonly checkerTimeoutMs: number;
  readonly pinnedCoreTokens: number;
  readonly retrievalItems: number;
  readonly retrievalMinScore: number;
  readonly rebuildTokens: number;
}

// The memory section of the deployment configuration: the write gate's limits, the checker's
// timeout, the pinned core's token budget, per-turn retrieval's count and score floor, and a rebuilt
// session's history budget. A setting the file leaves out takes its default.
export const memoryConfigSchema = z
  .strictObject({
    evidence_window: countSchema.default(defaultGateLimits.evidenceWindow),
    proposal_lapse_days: countSchema.default(defaultGateLimits.proposalLapseMs / dayMs),
    proposal_cap: countSchema.default(defaultGateLimits.proposalCap),

    // a live check took about 9 s, so 20 s keeps a slow one inside the timeout
    checker_timeout_ms: countSchema.default(20_000),
    pinned_core_tokens: z.int().positive().default(2000),
    retrieval_items: z.int().nonnegative().max(100).default(5),
    retrieval_min_score: z.number().nonnegative().default(0.25),
    rebuild_tokens: z.int().nonnegative().default(30_000),
  })
  .transform((config): MemoryConfig => ({
    limits: {
      evidenceWindow: config.evidence_window,
      proposalLapseMs: config.proposal_lapse_days * dayMs,
      proposalCap: config.proposal_cap,
    },
    checkerTimeoutMs: config.checker_timeout_ms,
    pinnedCoreTokens: config.pinned_core_tokens,
    retrievalItems: config.retrieval_items,
    retrievalMinScore: config.retrieval_min_score,
    rebuildTokens: config.rebuild_tokens,
  }));
