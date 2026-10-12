import type { GateLimits } from './gate-types';

// The gate's defaults: a quote comes from your last 20 messages in the thread, a memory proposal
// waits 14 days before it lapses, because a fact rarely goes stale in the days an action waits, and
// a turn, task run or writer batch makes at most 10 proposals.
export const defaultGateLimits: GateLimits = {
  evidenceWindow: 20,
  proposalLapseMs: 14 * 24 * 60 * 60 * 1000,
  proposalCap: 10,
};
