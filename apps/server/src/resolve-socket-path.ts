import { join } from 'node:path';
import { loadDeploymentConfig } from './load-deployment-config';

export async function resolveSocketPath(configPath: string): Promise<string> {
  const config = await loadDeploymentConfig(configPath);

  return join(config.server.dataDir, 'run', 'control.sock');
}
