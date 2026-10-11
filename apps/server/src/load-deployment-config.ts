import { readFile } from 'node:fs/promises';
import type { DeploymentConfig } from './deployment-config-schema';
import { deploymentConfigSchema } from './deployment-config-schema';

// Loads the deployment configuration from its YAML file, mounted read-only, at start. A file the
// schema refuses throws with each issue's path, so nixie refuses to start on a missing setting,
// such as an unset conversation role.
export async function loadDeploymentConfig(
  path = '/etc/nixie/config.yaml',
): Promise<DeploymentConfig> {
  const text = await readFile(path, 'utf8');
  const result = deploymentConfigSchema.safeParse(Bun.YAML.parse(text));

  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);

    throw new Error(`nixie refuses the deployment configuration in ${path}:\n${issues.join('\n')}`);
  }
  return result.data;
}
