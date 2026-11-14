import type { DeploymentConfig } from './deployment-config-schema';
import { readDeploymentConfig } from './read-deployment-config';

// The CLI commands and the tests take the settings and leave out the unknown keys, which only the
// server start reports.
export async function loadDeploymentConfig(
  path = '/etc/nixie/config.yaml',
): Promise<DeploymentConfig> {
  const loaded = await readDeploymentConfig(path);

  return loaded.config;
}
