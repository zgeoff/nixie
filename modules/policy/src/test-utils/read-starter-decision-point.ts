import type { DecisionPointOptions } from '../make-decision-point';
import { makeDecisionPoint } from '../make-decision-point';
import type { DecisionPoint, EffectDeclaration, RuleEntry } from '../types';
import { readStarterRules } from './read-starter-rules';

// The real decision point, with the starter rules in force and no owner message to give consent. A
// test that sends calls through a decision point uses it where the owner's rules would be in force.
export interface StarterOptions extends Partial<DecisionPointOptions> {
  // rules of the owner beside the starter rules
  readonly extraRules?: readonly RuleEntry[];
}

export function readStarterDecisionPoint(
  findDeclaration: (tool: string) => EffectDeclaration | null,
  overrides: StarterOptions = {},
): DecisionPoint {
  const rules = [...readStarterRules(), ...(overrides.extraRules ?? [])];

  return makeDecisionPoint({
    findDeclaration,
    readInputs: () =>
      Promise.resolve({ rules, contacts: [], tools: new Map(), ownerDestinations: [] }),
    findJobDestinations: () => [],
    readConsent: () => Promise.resolve(null),
    ...overrides,
  });
}
