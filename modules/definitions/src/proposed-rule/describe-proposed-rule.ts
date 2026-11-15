import type { Rule, RuleForm } from '@heynixie/policy';
import { renderRule, toRuleForm } from '@heynixie/policy';
import { buildRuleHash } from '../utils/build-rule-hash';
import { buildSHA256 } from '../utils/build-sha256';
import { isLiftingRule } from '../utils/is-lifting-rule';
import { toCanonicalJSON } from '../utils/to-canonical-json';

export interface ProposedRuleFacts {
  readonly ruleHash: string;
  readonly actionHash: string;
  readonly riskClass: 'always_ask' | 'lifting';
  readonly sentence: string;
}

// The rule has no ID until its approval gives it one, so the hash and the sentence read it under a
// fixed name.
const placeholderID = 'proposed';

export function toRuleBodyForm(body: Omit<Rule, 'id'>): Omit<RuleForm, 'id'> {
  const { id: _id, ...form } = toRuleForm({ ...body, id: placeholderID });

  return form;
}

export function describeProposedRule(body: Omit<Rule, 'id'>): ProposedRuleFacts {
  const form = toRuleForm({ ...body, id: placeholderID });
  const ruleHash = buildRuleHash(form);

  return {
    ruleHash,
    actionHash: buildSHA256(toCanonicalJSON({ kind: 'proposed_rule', ruleHash })),
    riskClass: isLiftingRule(body) ? 'lifting' : 'always_ask',
    sentence: renderRule(form),
  };
}
