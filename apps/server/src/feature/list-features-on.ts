import { featureIDs } from '@heynixie/contract';
import type { FeatureID } from '@heynixie/contract';

// The parts of the deployment config that decide a feature. DeploymentConfig satisfies it.
export interface FeatureConfig {
  readonly computer?: unknown;
  readonly code?: unknown;
  readonly google?: unknown;
  readonly voice?: unknown;
  readonly devices?: unknown;
  readonly images: unknown;
  readonly mail?: unknown;
  readonly phone?: unknown;
  readonly coding?: { readonly atc?: unknown } | undefined;
  readonly spendStop?: unknown;
  readonly search?: unknown;
}

// The one place that works out which features a deployment has on, from its config. A feature with
// a section is on when its section is there.
export function listFeaturesOn(config: FeatureConfig): readonly FeatureID[] {
  const isOn: Record<FeatureID, boolean> = {
    computer: config.computer !== undefined,
    code: config.code !== undefined,
    devices: config.devices !== undefined,
    google: config.google !== undefined,
    mcp: true,
    voice: config.voice !== undefined,
    images: config.images !== null,
    mail: config.mail !== undefined,
    coding: config.coding?.atc !== undefined,
    spend: config.spendStop !== undefined,
    search: config.search !== undefined,
    phone: config.phone !== undefined,
  };

  return featureIDs.filter((feature) => isOn[feature]);
}
