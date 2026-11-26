import { featureIDs } from '@heynixie/contract';
import type { FeatureID } from '@heynixie/contract';

// The parts of the deployment config that decide a feature. DeploymentConfig satisfies it.
export interface FeatureConfig {
  readonly voice?: unknown;
  readonly images: unknown;
  readonly mail?: unknown;
  readonly coding?: { readonly atc?: unknown } | undefined;
  readonly spendStop?: unknown;
  readonly search: { readonly credential: unknown };
}

// The one place that works out which features a deployment has on, from its config. Until a
// feature's switch lands, each feature is on by today's rule for it.
export function listFeaturesOn(config: FeatureConfig): readonly FeatureID[] {
  const isOn: Record<FeatureID, boolean> = {
    computer: true,
    code: true,
    devices: true,
    google: true,
    mcp: true,
    voice: config.voice !== undefined,
    images: config.images !== null,
    mail: config.mail !== undefined,
    coding: config.coding?.atc !== undefined,
    spend: config.spendStop !== undefined,
    search: config.search.credential !== null,
  };

  return featureIDs.filter((feature) => isOn[feature]);
}
