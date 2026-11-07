import type { RuleChange } from '@heynixie/policy';
import { pickRuleChange } from '@heynixie/policy';
import { buildRuntimeOverlay } from './build-runtime-overlay';
import type { DefinitionRule, RuntimeRule, StoredRule } from './types';

export interface RuleEdit {
  readonly ruleID: string;
  readonly before: StoredRule | null;
  readonly after: StoredRule | null;
  readonly change: RuleChange;
}

interface OverlaidRule {
  readonly change: RuntimeRule;
  readonly beneath: StoredRule | null;
}

export interface PlannedRule {
  readonly rule: StoredRule;
  readonly changeID: string | null;
}

export interface RuleSeedPlan {
  readonly seeded: readonly StoredRule[];
  readonly applied: readonly RuleEdit[];
  readonly held: readonly RuleEdit[];
  readonly adopted: readonly RuntimeRule[];
  readonly overlaid: readonly OverlaidRule[];
  readonly inForce: readonly PlannedRule[];
}

export interface RuleSeedInput {
  readonly definitions: readonly DefinitionRule[];
  readonly seeded: readonly StoredRule[];
  readonly runtime: readonly RuntimeRule[];
}

// The definitions' rules apply over the ones seeded before only where the edit narrows, and every
// runtime change stays over both until the definitions hold its version.
export function buildRuleSeedPlan(input: RuleSeedInput): RuleSeedPlan {
  const overlay = buildRuntimeOverlay({
    seeded: input.definitions.map((rule) => ({ key: rule.rule.id, hash: rule.hash, value: rule })),
    changes: input.runtime.map((change) => ({
      key: change.ruleID,
      hash: change.rule?.hash ?? null,
      value: change,
    })),
  });

  const overridden = new Set(overlay.inForce.map((overlaid) => overlaid.change.ruleID));
  const adopted = new Set(overlay.adopted.map((change) => change.ruleID));
  const definitions = new Map(input.definitions.map((rule) => [rule.rule.id, toStoredRule(rule)]));
  const seeded = new Map(input.seeded.map((rule) => [rule.rule.id, rule]));

  const applied: RuleEdit[] = [];
  const held: RuleEdit[] = [];

  for (const ruleID of [...new Set([...definitions.keys(), ...seeded.keys()])].toSorted()) {
    const before = seeded.get(ruleID) ?? null;
    const after = definitions.get(ruleID) ?? null;

    if (overridden.has(ruleID) || before?.hash === after?.hash) {
      continue;
    }

    const change = adopted.has(ruleID)
      ? 'unchanged'
      : pickRuleChange(before?.rule ?? null, after?.rule ?? null);

    const edit = { ruleID, before, after, change };

    if (change === 'widening') {
      held.push(edit);
      continue;
    }

    applied.push(edit);

    if (after === null) {
      seeded.delete(ruleID);
    } else {
      seeded.set(ruleID, after);
    }
  }

  return {
    seeded: [...seeded.values()].toSorted(byRuleID),
    applied,
    held,
    adopted: overlay.adopted,
    overlaid: overlay.inForce,
    inForce: collectInForce(seeded, overlay.inForce),
  };
}

function toStoredRule(rule: DefinitionRule): StoredRule {
  return { hash: rule.hash, rule: rule.rule };
}

function byRuleID(left: StoredRule, right: StoredRule): number {
  return left.rule.id < right.rule.id ? -1 : 1;
}

function collectInForce(
  seeded: ReadonlyMap<string, StoredRule>,
  overlaid: readonly OverlaidRule[],
): readonly PlannedRule[] {
  const byID = new Map<string, PlannedRule>(
    [...seeded].map(([ruleID, rule]) => [ruleID, { rule, changeID: null }]),
  );

  for (const entry of overlaid) {
    if (entry.change.rule === null) {
      byID.delete(entry.change.ruleID);
    } else {
      byID.set(entry.change.ruleID, { rule: entry.change.rule, changeID: entry.change.changeID });
    }
  }

  return [...byID.values()].toSorted((left, right) => byRuleID(left.rule, right.rule));
}
