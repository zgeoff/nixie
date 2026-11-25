import { createHash } from 'node:crypto';
import type { DefinitionsSource, SnapshotPolicy, TaskSeedContext } from '@heynixie/definitions';
import { createPathSource, makeCheckTaskStart } from '@heynixie/definitions';
import { buildCheckerRules } from '@heynixie/memory';
import { resolveRoleProfile } from '@heynixie/models';
import { consentCheckerPrompt, getFixedRules } from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import type { DeploymentConfig } from '../deployment/deployment-config-schema';
import { buildSnapshotPolicy } from './build-snapshot-policy';

export interface SeedInputs {
  readonly source: DefinitionsSource;
  readonly buildPolicy: (prompts: PromptOverrides) => SnapshotPolicy;
  readonly tasks: TaskSeedContext;
}

export interface SeedTools {
  readonly definitions: readonly ToolDefinition[];
  readonly actions: {
    readonly logConnector: { readonly tool: ToolDefinition };
    readonly queuedTools: readonly ToolDefinition[];
  };
  readonly taskBounds: TaskStartBounds;
}

export function buildSeedInputs(
  config: Pick<DeploymentConfig, 'definitions' | 'models' | 'owner'>,
  tools: SeedTools,
): SeedInputs {
  const policy = buildSnapshotPolicy(
    getFixedRules(),
    [...tools.definitions, tools.actions.logConnector.tool, ...tools.actions.queuedTools],
    {
      prompt: `sha256:${createHash('sha256').update(consentCheckerPrompt).digest('hex')}`,
      profile: resolveRoleProfile(config.models, 'checker').id,
    },
  );

  const conversationTools = tools.definitions.map((tool) => tool.name);

  const toolNames = [
    ...conversationTools,
    tools.actions.logConnector.tool.name,
    ...tools.actions.queuedTools.map((tool) => tool.name),
  ];

  return {
    source: createPathSource({ directory: config.definitions.source.path }),
    tasks: {
      toolNames,
      checkTaskStart: makeCheckTaskStart({
        bounds: tools.taskBounds,
        toolNames,
        conversationTools,
      }),
    },
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
