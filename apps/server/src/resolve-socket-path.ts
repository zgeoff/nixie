import { join } from 'node:path';
import { loadDeploymentConfig } from './load-deployment-config';

// Returns the path of the control socket that the running server opened in its data directory.
export async function resolveSocketPath(configPath: string): Promise<string> {
  const config = await loadDeploymentConfig(configPath);

  return join(config.server.dataDir, 'run', 'control.sock');
}
