import { describeRuleCondition, parseRule, renderRule } from '@heynixie/policy';
import type { RuleCondition } from '@heynixie/policy';
import type { Kysely } from 'kysely';
import type { DefinitionsTables } from '../types';

export interface ActiveMandate {
  readonly mandateID: string;
  readonly startedAt: number;

  // milliseconds since the epoch
  readonly expires: number;
  readonly changeIDs: readonly string[];
  readonly rules: readonly {
    readonly ruleID: string;
    readonly sentence: string;
    readonly condition?: RuleCondition;
  }[];
}

// A mandate is active while a runtime change that its ID names is in force. A rule with the same
// field in your definitions is an ordinary seeded rule, because only a mandate's own rules take
// the mandate ID and a number as their ID.
export async function readActiveMandates(db: Kysely<unknown>): Promise<readonly ActiveMandate[]> {
  const rows = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('runtime_rules')
    .innerJoin('rule_versions', 'rule_versions.rule_hash', 'runtime_rules.rule_hash')
    .select(['runtime_rules.change_id', 'runtime_rules.changed_at', 'rule_versions.rule'])
    .where('runtime_rules.state', '=', 'in_force')
    .orderBy('runtime_rules.rule_id')
    .execute();

  const mandates = new Map<
    string,
    { -readonly [Key in keyof ActiveMandate]: ActiveMandate[Key] }
  >();

  for (const row of rows) {
    const rule = parseRule(JSON.parse(row.rule));

    if (rule.mandate === undefined || !rule.id.startsWith(`${rule.mandate}-`)) {
      continue;
    }

    const found = mandates.get(rule.mandate) ?? {
      mandateID: rule.mandate,
      startedAt: row.changed_at,
      expires: Date.parse(rule.expires ?? ''),
      changeIDs: [],
      rules: [],
    };

    const condition = describeRuleCondition(rule, 'nixie');

    mandates.set(rule.mandate, {
      ...found,
      startedAt: Math.min(found.startedAt, row.changed_at),
      changeIDs: [...found.changeIDs, row.change_id],
      rules: [
        ...found.rules,
        {
          ruleID: rule.id,
          sentence: renderRule(rule),
          ...(condition === undefined ? {} : { condition }),
        },
      ],
    });
  }

  return [...mandates.values()];
}
