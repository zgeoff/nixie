import { renderRule, toRuleForm } from '@heynixie/policy';
import { buildRuleHash } from '../utils/build-rule-hash';
import { buildSHA256 } from '../utils/build-sha256';
import { isLiftingRule } from '../utils/is-lifting-rule';
import { toCanonicalJSON } from '../utils/to-canonical-json';
import type { MandateRule } from './pick-mandate';

export interface MandateFacts {
  readonly forms: ReturnType<typeof toRuleForm>[];
  readonly ruleHashes: string[];
  readonly sentences: string[];
  readonly riskClass: 'always_ask' | 'lifting';
  readonly actionHash: string;
}

// The action hash covers the mandate ID, each rule's hash and the end, so an approval names exactly
// what the card showed.
export function describeMandate(
  mandateID: string,
  expires: number,
  rules: readonly MandateRule[],
): MandateFacts {
  const forms = rules.map((entry) => toRuleForm({ ...entry.rule, id: entry.ruleID }));
  const ruleHashes = forms.map((form) => buildRuleHash(form));

  return {
    forms,
    ruleHashes,
    sentences: forms.map((form) => renderRule(form)),
    riskClass: forms.some((form) => isLiftingRule(form)) ? 'lifting' : 'always_ask',
    actionHash: buildSHA256(toCanonicalJSON({ mandateID, ruleHashes, expires })),
  };
}
