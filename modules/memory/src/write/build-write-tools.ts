import type { ToolDefinition } from '@heynixie/tools';
import type { ModelWriteStore } from '../gate/gate-context';
import { buildPinTool } from '../pin/build-pin-tool';
import { buildSensitiveTool } from '../sensitive/build-sensitive-tool';
import { buildEditTool } from '../tool/build-edit-tool';
import { buildRememberTool } from '../tool/build-remember-tool';
import { buildRetireTool } from '../tool/build-retire-tool';
import { buildUnpinTool } from '../tool/build-unpin-tool';
import type { ItemIDStore } from '../types';

export function buildWriteTools(memory: ModelWriteStore & ItemIDStore): readonly ToolDefinition[] {
  return [
    buildRememberTool(memory),
    buildEditTool(memory),
    buildRetireTool(memory),
    buildPinTool(memory),
    buildUnpinTool(memory),
    buildSensitiveTool(memory),
  ];
}
