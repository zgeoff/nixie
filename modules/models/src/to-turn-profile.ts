import type { TurnProfile } from '@heynixie/wire';
import type { ModelProfile } from './types';

export function toTurnProfile(profile: ModelProfile): TurnProfile {
  return {
    model: profile.model,
    baseURL: profile.baseURL,
    effort: profile.effort,
    authHeader: profile.authHeader,
    contextTokens: profile.contextTokens,
    cacheTTL: profile.cacheTTL,
  };
}
