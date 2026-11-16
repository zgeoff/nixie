import type { ToolRegistry } from '../types';

// The name the decision point knows a call by: the tool's own, or `<tool>/<variant>` when the tool
// has variants and its input picks one that it declares.
export function pickPolicyToolName(registry: ToolRegistry, tool: string, input: unknown): string {
  const variants = registry.findTool(tool)?.definition.variants;

  if (variants === undefined) {
    return tool;
  }

  const name = variants.pick(input);

  return name in variants.declarations ? `${tool}/${name}` : tool;
}
