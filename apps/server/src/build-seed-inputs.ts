import type { DefinitionsSource, SnapshotPolicy } from '@heynixie/definitions';
import { createPathSource } from '@heynixie/definitions';
import { buildCheckerRules } from '@heynixie/memory';
import { getFixedRules } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import type { ToolDefinition } from '@heynixie/tools';
import { buildSnapshotPolicy } from './build-snapshot-policy';
import type { DeploymentConfig } from './deployment-config-schema';

export interface SeedInputs {
  readonly source: DefinitionsSource;
  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;
}

export interface SeedTools {
  readonly definitions: readonly ToolDefinition[];
  readonly actions: { readonly logConnector: { readonly tool: ToolDefinition } };
}

export function buildSeedInputs(
  config: Pick<DeploymentConfig, 'definitions' | 'owner'>,
  tools: SeedTools,
): SeedInputs {
  const policy = buildSnapshotPolicy(getFixedRules(), [
    ...tools.definitions,
    tools.actions.logConnector.tool,
  ]);

  return {
    source: createPathSource({ directory: config.definitions.source.path }),
    buildPolicy: (prompts) => ({
      ...policy,
      rules: [
        ...policy.rules,
        ...buildCheckerRules(config.owner.name, prompts).map((rule) => ({
          id: rule.id,
          prompt: rule.prompt,
        })),
      ],
    }),
  };
}
