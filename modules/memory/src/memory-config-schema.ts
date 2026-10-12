import { z } from 'zod';
import { defaultGateLimits } from './default-gate-limits';
import type { GateLimits } from './gate-types';

const dayMs = 24 * 60 * 60 * 1000;

const countSchema = z.number().int().positive();

export interface MemoryConfig {
  readonly limits: GateLimits;
  readonly checkerTimeoutMs: number;
}

// The memory section of the deployment configuration: the write gate's limits and the checker's
// timeout. A setting the file leaves out takes its default.
export const memoryConfigSchema = z
  .strictObject({
    evidence_window: countSchema.default(defaultGateLimits.evidenceWindow),
    proposal_lapse_days: countSchema.default(defaultGateLimits.proposalLapseMs / dayMs),
    proposal_cap: countSchema.default(defaultGateLimits.proposalCap),
    checker_timeout_ms: countSchema.default(10_000),
  })
  .transform((config): MemoryConfig => ({
    limits: {
      evidenceWindow: config.evidence_window,
      proposalLapseMs: config.proposal_lapse_days * dayMs,
      proposalCap: config.proposal_cap,
    },
    checkerTimeoutMs: config.checker_timeout_ms,
  }));
