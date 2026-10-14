import type { DefinitionsSource, SnapshotPolicy } from '@heynixie/definitions';
import { createPathSource } from '@heynixie/definitions';
import { buildCheckerRules } from '@heynixie/memory';
import { getFixedRules } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';
import { buildSnapshotPolicy } from './build-snapshot-policy';
import type { DeploymentConfig } from './deployment-config-schema';

export interface SeedInputs {
  readonly source: DefinitionsSource;
  readonly policy: SnapshotPolicy;
}

// What every seed reads: the configured definitions source, and the policy in force from the
// build's fixed rules, the memory gate's checker prompts and its registered tools.
export function buildSeedInputs(
  config: DeploymentConfig,
  tools: readonly ToolDefinition[],
): SeedInputs {
  const policy = buildSnapshotPolicy(getFixedRules(), tools);

  return {
    source: createPathSource({ dir: config.definitions.source.path }),
    policy: {
      ...policy,
      rules: [
        ...policy.rules,
        ...buildCheckerRules(config.owner.name).map((rule) => ({
          id: rule.id,
          prompt: rule.prompt,
        })),
      ],
    },
  };
}
