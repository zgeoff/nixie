import type { ToolDefinition } from '@heynixie/tools';
import { buildEditTool } from './build-edit-tool';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import type { ModelWriteStore } from './gate-types';
import type { ItemIDStore } from './types';

// Builds the model's memory write tools: remember, edit and retire, each behind its gate.
export function buildWriteTools(memory: ModelWriteStore & ItemIDStore): readonly ToolDefinition[] {
  return [buildRememberTool(memory), buildEditTool(memory), buildRetireTool(memory)];
}
