import type { ToolDefinition } from '@heynixie/tools';
import { buildCommentTool } from './build-comment-tool';
import { buildDiffTool } from './build-diff-tool';
import { buildEditTool } from './build-edit-tool';
import { buildPendingTool } from './build-pending-tool';
import type { RecallLineOptions } from './build-recall-tool';
import { buildRecallTool } from './build-recall-tool';
import { buildRememberTool } from './build-remember-tool';
import { buildRetireTool } from './build-retire-tool';
import type { MemoryToolStore } from './memory-tool-store';

// Builds the model's memory tools. recall, pending and diff declare read; the 3 write tools and
// comment declare note. Every write runs through its gate, which sets the provenance from the run
// and the checks, never from the model's arguments. pending and recall read the options' clock.
export function buildMemoryTools(
  memory: MemoryToolStore,
  options: RecallLineOptions,
): readonly ToolDefinition[] {
  return [
    buildRecallTool(memory, options),
    buildPendingTool(memory, options.clock),
    buildRememberTool(memory),
    buildEditTool(memory),
    buildRetireTool(memory),
    buildDiffTool(memory),
    buildCommentTool(memory),
  ];
}
