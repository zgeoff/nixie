import type { SnapshotPolicy } from '@heynixie/definitions';
import type { FixedRule } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';

export function buildSnapshotPolicy(
  rules: readonly FixedRule[],
  tools: readonly ToolDefinition[],
): SnapshotPolicy {
  return {
    rules: rules.map((rule) => ({ id: rule.id, revision: rule.revision, sentence: rule.sentence })),
    tools: tools.map((tool) => ({
      name: tool.name,
      effects: [...tool.declaration.effects],
      destinations: [...tool.declaration.destinations],
      amount: tool.declaration.amount,
      content: [...tool.declaration.content],
      results: { ...tool.declaration.results },
    })),
  };
}
