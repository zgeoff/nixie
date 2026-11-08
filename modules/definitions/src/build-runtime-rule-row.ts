import type { Rule } from '@heynixie/policy';
import { toRuleForm } from '@heynixie/policy';
import { buildRuleHash } from './build-rule-hash';
import type { RuleChanger, RuntimeRuleRow, StoredRule } from './types';

export interface RuntimeRuleInput {
  readonly ruleID: string;
  readonly rule: Omit<Rule, 'id'> | null;
  readonly changedBy: RuleChanger;
  readonly reason: string;
}

export interface RuntimeRuleRowInput {
  readonly changeID: string;
  readonly input: RuntimeRuleInput;
  readonly previous: { readonly change_id: string; readonly base_hash: string | null } | null;
  readonly definitionsHash: string | null;
  readonly at: number;
}

export interface RuntimeRuleWrite {
  readonly row: RuntimeRuleRow;
  readonly stored: StoredRule | null;
  readonly supersededID: string | null;
}

// A change over an earlier runtime change keeps that change's base, so a conflict still compares
// against the definitions' version you first changed.
export function buildRuntimeRuleRow(write: RuntimeRuleRowInput): RuntimeRuleWrite {
  const rule = write.input.rule;
  const form = rule === null ? null : toRuleForm({ ...rule, id: write.input.ruleID });
  const stored = form === null ? null : { rule: form, hash: buildRuleHash(form) };

  return {
    row: {
      change_id: write.changeID,
      rule_id: write.input.ruleID,
      rule_hash: stored?.hash ?? null,
      state: 'in_force',
      base_hash: write.previous === null ? write.definitionsHash : write.previous.base_hash,
      definitions_hash: write.definitionsHash,
      changed_by: write.input.changedBy,
      reason: write.input.reason,
      changed_at: write.at,
      updated_at: write.at,
    },
    stored,
    supersededID: write.previous?.change_id ?? null,
  };
}
