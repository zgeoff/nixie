import type { SnapshotPolicy } from '@heynixie/definitions';
import type { FixedRule } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';

// The policy in force for the snapshot hash: each fixed rule by its ID, revision and sentence, and
// each registered tool's effect declaration, so a release that changes either changes the hash.
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
