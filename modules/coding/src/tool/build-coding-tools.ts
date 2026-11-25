import type { ToolDefinition } from '@heynixie/tools';
import type { CodingAdapter, CodingToolContext } from '../types';
import { buildCodingInputTool } from './build-coding-input-tool';
import { buildCodingReadTool } from './build-coding-read-tool';
import { buildCodingSessionsTool } from './build-coding-sessions-tool';
import { buildCodingWatchTool } from './build-coding-watch-tool';

// The tools that a model calls on coding sessions, for one adapter.
export function buildCodingTools(
  context: CodingToolContext,
  adapter: CodingAdapter,
): ToolDefinition[] {
  return [
    buildCodingSessionsTool(context, adapter),
    buildCodingInputTool(context, adapter, 'steer'),
    buildCodingInputTool(context, adapter, 'message'),
    buildCodingReadTool(context, adapter),
    buildCodingWatchTool(context, adapter),
  ];
}
