import type { AllowRuleCall, FindAllowRule } from '../gate-types';

// An allow rule lookup that holds one rule of yours, on the one tool it names, so a write through
// that tool matches the rule and a write through any other tool finds none.
export function makeToolAllowRule(tool: AllowRuleCall['tool']): FindAllowRule {
  return (call) => {
    const match = call.tool === tool ? { ruleID: `rule-${tool}`, revision: 1 } : null;

    return Promise.resolve(match);
  };
}
