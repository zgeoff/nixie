import { isActionHeldMemoryTool } from './is-action-held-memory-tool';

// The tool whose rules also cover the held tool's calls.
export function pickRuleAliasTool(tool: string): string | null {
  return isActionHeldMemoryTool(tool) ? 'memory.edit' : null;
}
