import { match } from 'ts-pattern';
import { isRuleConflict } from './is-rule-conflict';

export interface RuleResolution {
  readonly ruleID: string;
  readonly keep: 'nixie' | 'repo';
}

interface RuntimeChangeHashes {
  readonly change_id: string;
  readonly base_hash: string | null;
  readonly definitions_hash: string | null;
}

export interface RuleResolutionInput {
  readonly change: RuntimeChangeHashes | null;
  readonly definitionsHash: string | null;
  readonly resolution: RuleResolution;
}

export type RuleResolutionMove =
  | { readonly status: 'refused'; readonly code: 'NOT_FOUND'; readonly reason: string }
  | { readonly status: 'keep-nixie'; readonly changeID: string }
  | { readonly status: 'keep-repo'; readonly changeID: string; readonly seededHash: string | null };

export function pickRuleResolutionMove(input: RuleResolutionInput): RuleResolutionMove {
  const change = input.change;

  if (change === null || !isRuleConflict(change.base_hash, change.definitions_hash)) {
    return {
      status: 'refused',
      code: 'NOT_FOUND',
      reason: `the rule ${input.resolution.ruleID} has no conflict between nixie's version and the repo's`,
    };
  }

  return match(input.resolution.keep)
    .with('nixie', () => ({ status: 'keep-nixie' as const, changeID: change.change_id }))
    .with('repo', () => ({
      status: 'keep-repo' as const,
      changeID: change.change_id,
      seededHash: input.definitionsHash,
    }))
    .exhaustive();
}
