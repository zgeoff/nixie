import { buildCodingTools } from '@heynixie/coding';
import type { ToolDefinition } from '@heynixie/tools';
import type { ServerParts } from '../types';
import type { ServerCoding } from './build-server-coding';

interface CodingToolsContext {
  readonly apiContext: ServerParts['apiContext'];
  readonly coding: ServerCoding | null;
}

// The tools that a model calls on coding sessions, or none without a coding runner.
export function buildServerCodingTools(context: CodingToolsContext): ToolDefinition[] {
  if (context.coding === null) {
    return [];
  }

  return buildCodingTools(
    { ...context.coding.context, tasks: context.apiContext },
    context.coding.adapter,
  );
}
