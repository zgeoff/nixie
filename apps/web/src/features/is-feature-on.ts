import type { FeatureID } from '@heynixie/contract';

// A feature counts as on while nixie has not said which features are on, so a page never flashes
// as off before the answer.
export function isFeatureOn(features: readonly FeatureID[] | null, feature: FeatureID): boolean {
  return features === null || features.includes(feature);
}
