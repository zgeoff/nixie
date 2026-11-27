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
    refuseFeature(feature, buildFeatureOff);
  }
}

// The same refusal with no check, for the answers of a feature that is off: its type says the
// call never returns, so a handler of any output type can end with it.
export function refuseFeature(feature: FeatureID, buildFeatureOff: BuildFeatureOff): never {
  throw buildFeatureOff({ data: { feature } });
}
