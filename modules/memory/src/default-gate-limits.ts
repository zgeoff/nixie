import type { GateLimits } from './gate-types';

// The gate's defaults. A proposal waits 14 days, because a fact rarely goes stale while an action
// waits. An approval holds for an item sharing 60% of the proposal's content words, which a reworded
// fact reaches and another fact on the same subject rarely does.
export const defaultGateLimits: GateLimits = {
  evidenceWindow: 20,
  proposalLapseMs: 14 * 24 * 60 * 60 * 1000,
  proposalCap: 10,
  closeMatchScore: 0.6,
};
