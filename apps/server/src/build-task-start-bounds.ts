import type { ModelsConfig } from '@heynixie/models';
import type { TaskStartBounds } from '@heynixie/tasks';
import type { ToolDefinition } from '@heynixie/tools';

export function buildTaskStartBounds(
  models: ModelsConfig,
  memoryTools: readonly ToolDefinition[],
): TaskStartBounds {
  return {
    // An entry that asks needs a decision point that can ask, so until then no task runs on it.
    models: models.selectable
      .filter((entry) => !entry.isAsked)
      .map((entry) => ({
        name: entry.name,
        profile: entry.profile,
        description: entry.description,
      })),
    limits: models.limits.taskRun,
    memoryTools: {
      read: memoryTools.filter((tool) => isReadOnlyTool(tool)).map((tool) => tool.name),
      write: memoryTools.filter((tool) => !isReadOnlyTool(tool)).map((tool) => tool.name),
    },
  };
}

function isReadOnlyTool(tool: ToolDefinition): boolean {
  return tool.declaration.effects.every((effect) => effect === 'read');
}
