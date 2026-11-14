import type { RuleForm } from '@heynixie/policy';
import { alwaysAskEffects, renderRule } from '@heynixie/policy';
import type { z } from 'zod';
import type { RuleEdit } from './build-rule-seed-plan';
import { buildSHA256 } from './build-sha256';
import type { HeldEffects } from './pick-seed-effects';
import type { ruleProposalSchema } from './rule-proposal-schema';
import { toCanonicalJSON } from './to-canonical-json';
import type { StoredRule } from './types';

export type RuleProposal = z.output<typeof ruleProposalSchema>;

export function buildRuleProposal(
  proposalID: string,
  edits: readonly RuleEdit[],
  effects: readonly HeldEffects[],
): RuleProposal {
  const isLifting = edits.some((edit) => isLiftingEdit(edit));

  return {
    proposalID,
    proposalHash: buildRuleProposalHash(edits, effects),
    ...(isLifting ? { riskClass: 'lifting' as const } : {}),
    changes: edits.map((edit) => ({
      ruleID: edit.ruleID,
      before: toRuleSide(edit.before),
      after: toRuleSide(edit.after),
      fields: collectFieldChanges(edit.before?.rule ?? null, edit.after?.rule ?? null),
    })),
    effectChanges: effects.map((held) => ({ tool: held.tool, remove: [...held.remove] })),
  };
}

function isLiftingEdit(edit: RuleEdit): boolean {
  const after = edit.after?.rule;

  if (after === undefined || !isLiftingRule(after)) {
    return false;
  }

  return edit.before === null || edit.before.hash !== edit.after?.hash;
}

function isLiftingRule(rule: RuleForm): boolean {
  return (
    rule.outcome === 'allow' && (rule.effects ?? []).some((effect) => alwaysAskEffects.has(effect))
  );
}

// A proposal with no effect change hashes as the release before did, so a pending one stays itself.
function buildRuleProposalHash(
  edits: readonly RuleEdit[],
  effects: readonly HeldEffects[],
): string {
  const rules = edits.map((edit) => ({
    ruleID: edit.ruleID,
    before: edit.before?.hash ?? null,
    after: edit.after?.hash ?? null,
  }));

  const hashed =
    effects.length === 0
      ? rules
      : { rules, effects: effects.map((held) => ({ tool: held.tool, remove: [...held.remove] })) };

  return buildSHA256(toCanonicalJSON(hashed));
}

function toRuleSide(stored: StoredRule | null): { hash: string; sentence: string } | null {
  return stored === null ? null : { hash: stored.hash, sentence: renderRule(stored.rule) };
}

function collectFieldChanges(
  before: RuleForm | null,
  after: RuleForm | null,
): { field: string; before: string | null; after: string | null }[] {
  const fields = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((field) => field !== 'id')
    .toSorted();

  return fields.flatMap((field) => {
    const old = toFieldText(before, field);
    const next = toFieldText(after, field);

    return old === next ? [] : [{ field, before: old, after: next }];
  });
}

function toFieldText(rule: RuleForm | null, field: string): string | null {
  const value = rule?.[field];

  return value === undefined ? null : toCanonicalJSON(value);
}
