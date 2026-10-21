import type { GateLimits } from './gate-types';

export const defaultGateLimits: GateLimits = {
  evidenceWindow: 20,
  proposalLapseMs: 14 * 24 * 60 * 60 * 1000,
  proposalCap: 10,
  closeMatchScore: 0.6,
};
