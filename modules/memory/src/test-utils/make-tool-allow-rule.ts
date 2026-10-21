import type { AllowRuleCall, FindAllowRule } from '../gate-types';

export function makeToolAllowRule(tool: AllowRuleCall['tool']): FindAllowRule {
  return (call) => {
    const match = call.tool === tool ? { ruleID: `rule-${tool}`, revision: 1 } : null;

    return Promise.resolve(match);
  };
}
