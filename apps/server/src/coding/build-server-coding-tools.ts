import type { CodingStartParts } from '@heynixie/coding';
import { buildCodingStartTool, buildCodingTools } from '@heynixie/coding';
import type { ToolDefinition } from '@heynixie/tools';
import type { ServerParts } from '../types';
import type { ServerCoding } from './build-server-coding';

interface CodingToolsContext {
  readonly apiContext: ServerParts['apiContext'];
  readonly coding: ServerCoding | null;
}

export type BuildCodingStart = (start: CodingStartParts) => ToolDefinition;

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

// Builds `coding.start` once the conversation has its start bounds, or null without a coding runner.
export function buildServerCodingStart(context: CodingToolsContext): BuildCodingStart | null {
  const coding = context.coding;

  if (coding === null) {
    return null;
  }

  return (start) =>
    buildCodingStartTool({ ...coding.context, tasks: context.apiContext }, coding.adapter, start);
}
