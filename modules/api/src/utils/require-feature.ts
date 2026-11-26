import type { FeatureID } from '@heynixie/contract';
import type { APIContext } from '../types';

interface FeatureOffInput {
  readonly data: { readonly feature: FeatureID };
}

type BuildFeatureOff = (input: FeatureOffInput) => Error;

// The one guard of a feature's procedures: when the feature is off, it throws the FEATURE_OFF
// error that the procedure's own error map builds.
export function requireFeature(
  context: Pick<APIContext, 'features'>,
  feature: FeatureID,
  buildFeatureOff: BuildFeatureOff,
): void {
  if (!context.features.includes(feature)) {
    throw buildFeatureOff({ data: { feature } });
  }
}
