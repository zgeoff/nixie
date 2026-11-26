import { featureIDs } from '@heynixie/contract';
import type { FeatureID } from '@heynixie/contract';
import { featureStore } from './feature-store';

export function readMockFeatures(): FeatureID[] {
  const off = new Set(featureStore.featuresOff.all().map((row) => row.feature));

  return featureIDs.filter((feature) => !off.has(feature));
}
