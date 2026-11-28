import type { ModelsConfig } from '@heynixie/models';
import { buildTaskRunLimits, checkHarnessFit, roleNeeds } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { mandateToolName } from '../rule/build-mandate-tool';

export function buildTaskStartBounds(
  models: ModelsConfig,
  memoryTools: readonly ToolDefinition[],
  conversationTools: readonly ToolDefinition[],
  reportDefaults: TaskStartBounds['reportDefaults'],
): TaskStartBounds {
  return {
    // An entry that asks needs a decision point that can ask, so until then no task runs on it.
    models: models.selectable
      .filter((entry) => !entry.isAsked)
      .map((entry) => {
        const profile = models.profiles[entry.profile];

        invariant(profile, `the selectable model ${entry.name} names no defined profile`);

        return {
          name: entry.name,
          profile: entry.profile,
          description: entry.description,
          missing: checkHarnessFit(profile, roleNeeds.task).missing,
        };
      }),
    limits: {
      default: buildTaskRunLimits(models.limits.taskRun.default),
      max: buildTaskRunLimits(models.limits.taskRun.max),
    },
    memoryTools: {
      read: memoryTools.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name),
      write: memoryTools.filter((tool) => !isReadOnlyTool(tool)).map((tool) => tool.name),
    },
    conversationTools: conversationTools
      .filter((tool) => tool.name !== mandateToolName)
      .map((tool) => tool.name),
    reportDefaults,
  };
}

function isReadOnlyTool(tool: ToolDefinition): boolean {
  return tool.declaration.effects.every((effect) => effect === 'read');
}
