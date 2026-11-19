// The conversation guest registers the tool server as nixie, and the Agent SDK shows the model each
// of its tools as mcp__<server>__<tool>, with each character outside [a-zA-Z0-9_-] replaced by _.
export function toSDKToolName(name: string): string {
  return `mcp__nixie__${name.replaceAll(/[^a-zA-Z0-9_-]/gu, '_')}`;
}
