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
  // the declaration of a registered tool, or null for a tool the registry does not hold
  readonly findDeclaration: (tool: string) => EffectDeclaration | null;
}

// The stage numbers of the full pipeline. Slice 1's fixed rules stand in for stages 3 to 9, and a
// decision they make records stage 3 with the deciding rule's ID.
const registryStage = 1;
const scopeStage = 2;

// Builds the decision point every tool call passes before it acts. The stages run in order and the
// first that decides returns: the registry, then the scope, then the fixed rules, the last of which
// decides every call.
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

// the first rule that covers the call, with its outcome; a later rule never runs
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
