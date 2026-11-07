import type { PlannedRule } from './build-rule-seed-plan';
import type { CurrentRule } from './read-rule-store';
import type { RuleInForce, RuleOrigin } from './types';

interface RuleRevisionEntry {
  readonly ruleID: string;
  readonly revision: number;
  readonly hash: string | null;
  readonly origin: RuleOrigin;
  readonly current: CurrentRule | null;
  readonly isChanged: boolean;
}

export interface RuleRevisions {
  readonly entries: readonly RuleRevisionEntry[];
  readonly inForce: readonly RuleInForce[];
}

// A rule's revision goes up each time its version in force changes, and a rule that leaves force
// keeps its row, so it comes back under the next revision.
export function buildRuleRevisions(
  current: ReadonlyMap<string, CurrentRule>,
  planned: readonly PlannedRule[],
): RuleRevisions {
  const byID = new Map(planned.map((entry) => [entry.rule.rule.id, entry]));

  const ruleIDs = [...new Set([...current.keys(), ...byID.keys()])].toSorted();
  const entries: RuleRevisionEntry[] = [];
  const inForce: RuleInForce[] = [];

  for (const ruleID of ruleIDs) {
    const entry = byID.get(ruleID) ?? null;
    const before = current.get(ruleID) ?? null;
    const hash = entry?.rule.hash ?? null;
    const origin = pickRuleOrigin(entry, before);
    const isChanged = (before?.hash ?? null) !== hash;
    const revision = (before?.revision ?? 0) + (isChanged ? 1 : 0);

    entries.push({ ruleID, revision, hash, origin, current: before, isChanged });

    if (entry !== null) {
      inForce.push({ ruleID, revision, rule: entry.rule, origin, changeID: entry.changeID });
    }
  }

  return { entries, inForce };
}

function pickRuleOrigin(entry: PlannedRule | null, current: CurrentRule | null): RuleOrigin {
  if (entry === null) {
    return current?.origin ?? 'definitions';
  }

  return entry.changeID === null ? 'definitions' : 'nixie';
}
