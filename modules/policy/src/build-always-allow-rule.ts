import { createHash } from 'node:crypto';
import type { JSONObject } from '@heynixie/log';
import { renderRule } from './render-rule';
import { toCanonicalText } from './to-canonical-text';
import { toRuleForm } from './to-rule-form';
import type { Rule, RuleCheck, RuleForm } from './types';

export interface AlwaysAllowFacts {
  readonly shortID: string;
  readonly tool: string;
  readonly input: JSONObject;
  readonly destinations: readonly string[];

  // the names of the arguments that hold free text
  readonly content: readonly string[];
}

export interface AlwaysAllowRule {
  readonly ruleID: string;
  readonly form: RuleForm;
  readonly hash: string;
  readonly sentence: string;
}

const unpinnableDestination = /[\s*]/u;

// The rule that Always allow creates: the tool, this action's destinations, and an eq check for
// each argument that is not free text. An action with an argument that no eq check can pin gets
// no rule.
export function buildAlwaysAllowRule(facts: AlwaysAllowFacts): AlwaysAllowRule | null {
  const checks: RuleCheck[] = [];

  for (const [name, value] of Object.entries(facts.input)) {
    if (facts.content.includes(name)) {
      continue;
    }

    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
      return null;
    }

    checks.push({ arg: name, op: 'eq', value });
  }

  if (facts.destinations.some((destination) => unpinnableDestination.test(destination))) {
    return null;
  }

  const ruleID = `${facts.tool.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}-${facts.shortID.toLowerCase()}`;

  const rule: Rule = {
    id: ruleID,
    outcome: 'allow',
    tools: [facts.tool],
    ...(checks.length === 0 ? {} : { checks }),
    ...(facts.destinations.length === 0 ? {} : { destinations: [...facts.destinations] }),
  };

  const form = toRuleForm(rule);

  return {
    ruleID,
    form,
    hash: createHash('sha256').update(toCanonicalText(form)).digest('hex'),
    sentence: renderRule(form),
  };
}
