import { createHash } from 'node:crypto';
import type { JSONObject } from '@heynixie/log';
import { isActionHeldMemoryTool } from '../memory/is-action-held-memory-tool';
import type { Rule, RuleCheck, RuleForm } from '../types';
import { toCanonicalText } from '../utils/to-canonical-text';
import type { ToolShape } from '../utils/tool-shapes';
import { toolShapes } from '../utils/tool-shapes';
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

const unpinnableDestination = /[\s*]/u;

// The rule that Always allow creates: the tool, this action's destinations, and an eq check for
// each argument that is not free text. An action with an argument that no eq check can pin gets
// no rule. A tool of a destination shape pins its destination alone, and with none it gets no rule.
export function buildAlwaysAllowRule(facts: AlwaysAllowFacts): AlwaysAllowRule | null {
  // a move's topics are free text that no check can pin, so a rule for one move would allow any
  if (isActionHeldMemoryTool(facts.tool)) {
    return null;
  }

  const checks: RuleCheck[] = [];
  const shapes = toolShapes.list();
  const shared = findSharedShape(shapes, facts.tool);
  const commandArgument = findCommandArgument(shapes, facts.tool);

  if (shared !== null && facts.destinations.length === 0) {
    return null;
  }

  if (commandArgument !== null) {
    const value = facts.input[commandArgument];
    const command = typeof value === 'string' ? value : '';
    const pattern = buildCommandPattern(command);

    if (pattern === null) {
      return null;
    }

    checks.push({ arg: commandArgument, op: 'matches', value: pattern });
  }

  const pinned = commandArgument !== null || shared !== null ? {} : facts.input;

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

  const ruleName = shared === null ? facts.tool : shared.name;
  const ruleID = `${ruleName.toLowerCase().replaceAll(/[^a-z0-9]+/gu, '-')}-${facts.shortID.toLowerCase()}`;

  const rule: Rule = {
    id: ruleID,
    outcome: 'allow',
    tools: shared === null ? [facts.tool] : [...shared.tools],
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

function findSharedShape(shapes: readonly ToolShape[], tool: string) {
  for (const shape of shapes) {
    if (shape.kind === 'destination' && shape.tools.includes(tool)) {
      return shape;
    }
  }

  return null;
}

function findCommandArgument(shapes: readonly ToolShape[], tool: string): string | null {
  for (const shape of shapes) {
    if (shape.kind === 'command' && shape.tool === tool) {
      return shape.argument;
    }
  }

  return null;
}
