import type { HarnessID } from '@heynixie/wire';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';

// The harnesses of the model profiles that the deployment configures, each once.
export function collectProfileHarnesses(models: DeploymentConfig['models']): HarnessID[] {
  return [...new Set(Object.values(models.profiles).map((profile) => profile.harness))];
}
