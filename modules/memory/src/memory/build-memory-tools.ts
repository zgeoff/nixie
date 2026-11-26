import type { ToolDefinition } from '@heynixie/tools';
import { buildMomentTools } from '../moment/tool/build-moment-tools';
import type { RecallLineOptions } from '../recall/build-recall-tool';
import { buildRecallTool } from '../recall/build-recall-tool';
import type { MemoryToolStore } from '../tool/memory-tool-store';
import { buildUsageTool } from '../usage/build-usage-tool';
import { buildWriteTools } from '../write/build-write-tools';
import { buildExportTool } from './build-export-tool';

export function buildMemoryTools(
  memory: MemoryToolStore,
  options: RecallLineOptions,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(memory, options),
    buildUsageTool(memory, options),
    ...buildWriteTools(memory),
    buildExportTool(),
    ...buildMomentTools(memory.moments, memory, options.clock),
  ];
}
