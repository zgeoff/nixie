import { buildCodingStartTool } from '@heynixie/coding';
import type { BuildCodingStart } from '../types';
import type { CodingToolsContext } from './types';

// Builds `coding.start` once the conversation has its start bounds, or null without a coding runner.
export function buildServerCodingStart(context: CodingToolsContext): BuildCodingStart | null {
  const coding = context.coding;

  if (coding === null) {
    return null;
  }

  return (start) =>
    buildCodingStartTool({ ...coding.context, tasks: context.apiContext }, coding.adapter, start);
}
