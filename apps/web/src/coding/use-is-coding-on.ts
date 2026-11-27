import type { FeatureID } from '@heynixie/contract';
import { isFeatureOn } from '../features/is-feature-on';
import { useFeatures } from '../features/use-features';

// The feature that every part of the web client under `coding/` belongs to.
const codingPart = { feature: 'coding' } as const satisfies { readonly feature: FeatureID };

export function useIsCodingOn(): boolean {
  const features = useFeatures();

  return isFeatureOn(features, codingPart.feature);
}
