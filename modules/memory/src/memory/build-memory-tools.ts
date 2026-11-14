import type { ToolDefinition } from '@heynixie/tools';
import { buildCommentTool } from '../consolidation/build-comment-tool';
import { buildMomentTools } from '../moment/tool/build-moment-tools';
import { buildPendingTool } from '../pending/build-pending-tool';
import type { RecallLineOptions } from '../recall/build-recall-tool';
import { buildRecallTool } from '../recall/build-recall-tool';
import { buildRateTool } from '../tool/build-rate-tool';
import type { RateToolOptions } from '../tool/build-rate-tool';
import type { MemoryToolStore } from '../tool/memory-tool-store';
import { buildDiffTool } from '../utils/build-diff-tool';
import { buildWriteTools } from '../write/build-write-tools';
import { buildExportTool } from './build-export-tool';

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
    ...buildMomentTools(memory.moments, memory, options.clock),
  ];
}
