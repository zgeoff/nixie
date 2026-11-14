import { readFile } from 'node:fs/promises';
import type { DeploymentConfig } from './deployment-config-schema';
import { deploymentConfigSchema } from './deployment-config-schema';

export interface LoadedDeploymentConfig {
  readonly config: DeploymentConfig;

  // The dotted path of each key the file holds that this release does not know
  readonly unknownKeys: readonly string[];
}

export async function readDeploymentConfig(
  path = '/etc/nixie/config.yaml',
): Promise<LoadedDeploymentConfig> {
  const text = await readFile(path, 'utf8');

  const raw = parseYAML(path, text);
  const unknownKeys: string[] = [];

  // Every schema stays strict, so an editor still flags a typo. The release strips each unknown key
  // and parses again, so a newer release's key never stops an older release from starting.
  for (;;) {
    const result = deploymentConfigSchema.safeParse(raw);

    if (result.success) {
      return { config: result.data, unknownKeys: unknownKeys.toSorted() };
    }

    const unrecognized = result.error.issues.filter((issue) => issue.code === 'unrecognized_keys');
    const others = result.error.issues.filter((issue) => issue.code !== 'unrecognized_keys');
    const removed = unrecognized.flatMap((issue) => removeKeys(raw, issue.path, issue.keys));

    if (others.length > 0 || removed.length === 0) {
      const issues = result.error.issues
        .filter((issue) => others.length === 0 || issue.code !== 'unrecognized_keys')
        .map((issue) => `${issue.path.join('.')}: ${issue.message}`);

      throw new Error(
        `nixie refuses the deployment configuration in ${path}:\n${issues.join('\n')}`,
      );
    }

    unknownKeys.push(...removed);
  }
}

function parseYAML(path: string, text: string): unknown {
  try {
    return Bun.YAML.parse(text);
  } catch {
    throw new Error(`nixie refuses the deployment configuration in ${path}: it is not YAML`);
  }
}

function removeKeys(raw: unknown, path: readonly PropertyKey[], keys: readonly string[]): string[] {
  const target = path.reduce<unknown>(
    (value, key) => (isRecord(value) ? value[key] : undefined),
    raw,
  );

  if (!isRecord(target)) {
    return [];
  }

  return keys.map((key) => {
    Reflect.deleteProperty(target, key);

    return [...path, key].map(String).join('.');
  });
}

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
  return typeof value === 'object' && value !== null;
}
