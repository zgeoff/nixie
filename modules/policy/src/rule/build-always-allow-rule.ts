import { createHash } from 'node:crypto';
import type { JSONObject } from '@heynixie/log';
import type { Rule, RuleCheck, RuleForm } from '../types';
import { toCanonicalText } from '../utils/to-canonical-text';
import { buildCommandPattern } from './is-command-match';
import { renderRule } from './render-rule';
import { toRuleForm } from './to-rule-form';

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

const commandTool = 'computer.run';

// The screen acts share one rule, so an answer on a site covers a click and a type there. It names
// these 2 tools and no other, and pins nothing but the host.
const screenTools = ['computer.screen_click', 'computer.screen_type'];
const unpinnableDestination = /[\s*]/u;

// The rule that Always allow creates: the tool, this action's destinations, and an eq check for
// each argument that is not free text. An action with an argument that no eq check can pin gets
// no rule. A screen act pins its host alone, and with no host it gets no rule.
export function buildAlwaysAllowRule(facts: AlwaysAllowFacts): AlwaysAllowRule | null {
  const checks: RuleCheck[] = [];
  const isScreenAct = screenTools.includes(facts.tool);

  if (isScreenAct && facts.destinations.length === 0) {
    return null;
  }

  if (facts.tool === commandTool) {
    const command = typeof facts.input['command'] === 'string' ? facts.input['command'] : '';
    const pattern = buildCommandPattern(command);

    if (pattern === null) {
      return null;
    }

    checks.push({ arg: 'command', op: 'matches', value: pattern });
  }

  const pinned = facts.tool === commandTool || isScreenAct ? {} : facts.input;

  for (const [name, value] of Object.entries(pinned)) {
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

  const ruleName = isScreenAct ? 'computer-screen-acts' : facts.tool;
  const ruleID = `${ruleName.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}-${facts.shortID.toLowerCase()}`;

  const rule: Rule = {
    id: ruleID,
    outcome: 'allow',
    tools: isScreenAct ? screenTools : [facts.tool],
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
