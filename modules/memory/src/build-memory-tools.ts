import type { ToolDefinition } from '@heynixie/tools';
import { buildCommentTool } from './build-comment-tool';
import { buildDiffTool } from './build-diff-tool';
import { buildExportTool } from './build-export-tool';
import { buildPendingTool } from './build-pending-tool';
import { buildRateTool } from './build-rate-tool';
import type { RateToolOptions } from './build-rate-tool';
import type { RecallLineOptions } from './build-recall-tool';
import { buildRecallTool } from './build-recall-tool';
import { buildWriteTools } from './build-write-tools';
import type { MemoryToolStore } from './memory-tool-store';

export function buildMemoryTools(
  memory: MemoryToolStore,
  options: RecallLineOptions & RateToolOptions,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(memory, options),
    buildRateTool(memory, options),
    buildPendingTool(memory, options.clock),
    ...buildWriteTools(memory),
    buildDiffTool(memory),
    buildCommentTool(memory),
    buildExportTool(),
  ];
}
