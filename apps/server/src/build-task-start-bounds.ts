import type { ModelsConfig } from '@heynixie/models';
import { checkHarnessFit, roleNeeds } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';
import invariant from 'tiny-invariant';

export function buildTaskStartBounds(
  models: ModelsConfig,
  memoryTools: readonly ToolDefinition[],
  conversationTools: readonly ToolDefinition[],
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
    limits: models.limits.taskRun,
    memoryTools: {
      read: memoryTools.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name),
      write: memoryTools.filter((tool) => !isReadOnlyTool(tool)).map((tool) => tool.name),
    },
    conversationTools: conversationTools.map((tool) => tool.name),
  };
}

function isReadOnlyTool(tool: ToolDefinition): boolean {
  return tool.declaration.effects.every((effect) => effect === 'read');
}
