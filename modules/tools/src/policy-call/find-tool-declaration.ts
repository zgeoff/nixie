import type { EffectDeclaration } from '@heynixie/policy';
import type { ToolRegistry } from '../types';

// The declaration that a policy tool name stands for: a tool, or one variant of a tool that has
// variants, written `<tool>/<variant>`.
export function findToolDeclaration(
  registry: ToolRegistry,
  name: string,
): EffectDeclaration | null {
  const tool = registry.findTool(name);

  if (tool !== null) {
    return tool.definition.declaration;
  }

  const slash = name.lastIndexOf('/');

  if (slash === -1) {
    return null;
  }

  const variants = registry.findTool(name.slice(0, slash))?.definition.variants;

  return variants?.declarations[name.slice(slash + 1)] ?? null;
}
