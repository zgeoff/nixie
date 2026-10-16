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
  readonly retrievalSelfNotes: number;
  readonly retrievalMessages: number;
  readonly retrievalMinScore: number;
  readonly retrievalMinSimilarity: number;
  readonly rebuildTokens: number;
}

// The memory section of the deployment configuration: the write gate, the checker's timeout, the
// pinned core's budget, per-turn retrieval's counts of items, self-notes and past messages and its
// floors, and a rebuilt session's history budget. A setting left out takes its default.
export const memoryConfigSchema = z
  .strictObject({
    evidence_window: countSchema.default(defaultGateLimits.evidenceWindow),
    proposal_lapse_days: countSchema.default(defaultGateLimits.proposalLapseMs / dayMs),
    proposal_cap: countSchema.default(defaultGateLimits.proposalCap),
    close_match_score: z.number().min(0).max(1).default(defaultGateLimits.closeMatchScore),

    // a live check took about 9 s, so 20 s keeps a slow one inside the timeout
    checker_timeout_ms: countSchema.default(20_000),
    pinned_core_tokens: z.int().positive().default(2000),
    retrieval_items: z.int().nonnegative().max(100).default(5),
    retrieval_self_notes: z.int().nonnegative().max(20).default(2),
    retrieval_messages: z.int().nonnegative().max(20).default(3),
    retrieval_min_score: z.number().nonnegative().default(0.25),

    // on the encoder spike's items, small talk such as "hello" peaked near 0.38 and two thirds of
    // the questions placed their item above it
    retrieval_min_similarity: z.number().min(-1).max(1).default(0.38),
    rebuild_tokens: z.int().nonnegative().default(30_000),
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
    retrievalItems: config.retrieval_items,
    retrievalSelfNotes: config.retrieval_self_notes,
    retrievalMessages: config.retrieval_messages,
    retrievalMinScore: config.retrieval_min_score,
    retrievalMinSimilarity: config.retrieval_min_similarity,
    rebuildTokens: config.rebuild_tokens,
  }));
