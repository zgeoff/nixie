import invariant from 'tiny-invariant';
import { getFixedRules } from './get-fixed-rules';
import type {
  DecisionPoint,
  EffectDeclaration,
  FixedRule,
  PolicyCall,
  PolicyDecision,
  PolicyOutcome,
} from './types';

export interface DecisionPointOptions {
  readonly findDeclaration: (tool: string) => EffectDeclaration | null;
}

const registryStage = 1;
const scopeStage = 2;

export function makeDecisionPoint(options: DecisionPointOptions): DecisionPoint {
  const rules = getFixedRules();

  return (call) => {
    const declaration = options.findDeclaration(call.tool);

    if (declaration === null || declaration.effects.length === 0) {
      return buildStageDenial(
        registryStage,
        `The tool ${call.tool} is unknown or has no effect declaration.`,
      );
    }

    if (!call.toolList.includes(call.tool)) {
      return buildStageDenial(scopeStage, `The tool ${call.tool} is not on this run's tool list.`);
    }

    return pickRuleDecision(rules, call, declaration);
  };
}

function buildStageDenial(stage: number, sentence: string): PolicyDecision {
  return { decision: { outcome: 'deny', stage, rule: null }, sentence };
}

const fixedRuleStage = 3;

function pickRuleDecision(
  rules: readonly FixedRule[],
  call: PolicyCall,
  declaration: EffectDeclaration,
): PolicyDecision {
  const decided = findRuleOutcome(rules, call, declaration);

  invariant(decided, 'no fixed rule decided the call, but slice1.read-only decides every call');

  return {
    decision: {
      outcome: decided.outcome,
      stage: fixedRuleStage,
      rule: { id: decided.rule.id, revision: decided.rule.revision },
    },
    sentence: decided.outcome === 'deny' ? `${decided.rule.id}: ${decided.rule.sentence}` : null,
  };
}

function findRuleOutcome(
  rules: readonly FixedRule[],
  call: PolicyCall,
  declaration: EffectDeclaration,
): { readonly rule: FixedRule; readonly outcome: PolicyOutcome } | undefined {
  for (const rule of rules) {
    const outcome = rule.pickOutcome(call, declaration);

    if (outcome !== null) {
      return { rule, outcome };
    }
  }

  return undefined;
}
