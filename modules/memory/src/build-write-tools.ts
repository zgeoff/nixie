import type { ToolDefinition } from '@heynixie/tools';
import { buildEditTool } from './build-edit-tool';
import { buildPinTool } from './build-pin-tool';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import { buildUnpinTool } from './build-unpin-tool';
import type { ModelWriteStore } from './gate-types';
import type { ItemIDStore } from './types';

export function buildWriteTools(memory: ModelWriteStore & ItemIDStore): readonly ToolDefinition[] {
  return [
    buildRememberTool(memory),
    buildEditTool(memory),
    buildRetireTool(memory),
    buildPinTool(memory),
    buildUnpinTool(memory),
  ];
}
