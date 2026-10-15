import type { TurnProfile } from '@heynixie/wire';
import type { ModelProfile } from './types';

// The profile as the guest needs it, with no credential reference and no prices.
export function toTurnProfile(profile: ModelProfile): TurnProfile {
  return {
    model: profile.model,
    baseURL: profile.baseURL,
    effort: profile.effort,
    authHeader: profile.authHeader,
    contextTokens: profile.contextTokens,
  };
}
