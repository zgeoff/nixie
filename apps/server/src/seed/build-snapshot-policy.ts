import type { SnapshotPolicy } from '@heynixie/definitions';
import type { JSONObject } from '@heynixie/log';
import type { RuleEntry } from '@heynixie/policy';
import { renderRule, toRuleForm } from '@heynixie/policy';
import type { ToolDefinition } from '@heynixie/tools';

export function buildSnapshotPolicy(
  rules: readonly RuleEntry[],
  tools: readonly ToolDefinition[],
  consent: JSONObject,
): SnapshotPolicy {
  return {
    rules: rules.map((entry) => ({
      id: entry.id,
      revision: entry.revision,
      sentence: renderRule(entry.rule),
      rule: toRuleForm(entry.rule),
    })),
    tools: tools.map((tool) => ({
      name: tool.name,
      effects: [...tool.declaration.effects],
      destinations: [...tool.declaration.destinations],
      amount: tool.declaration.amount,
      content: [...tool.declaration.content],
      results: { ...tool.declaration.results },
    })),
    contacts: [],
    consent,
  };
}
