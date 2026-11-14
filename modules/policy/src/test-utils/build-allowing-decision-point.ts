import type { DecisionPoint } from '../types';

// A decision point that allows every call, for a test of a tool that is not about the decision.
export function buildAllowingDecisionPoint(): DecisionPoint {
  return (call) =>
    Promise.resolve({
      decision: {
        outcome: 'allow',
        stage: 7,
        rule: null,
        destinations: [],
        snapshot: call.snapshot,
      },
      sentence: null,
    });
}
