import type { JSONObject } from '@heynixie/log';
import type { PolicyFactsResolution, RegisteredTool, ToolRun } from '../types';

// The facts a tool sets for the decision point, or null when it sets none and the call's own input
// and the step's sources stand.
export function resolveCallPolicyFacts(
  registered: RegisteredTool,
  input: JSONObject,
  run: ToolRun,
): PolicyFactsResolution | Promise<PolicyFactsResolution> | null {
  return registered.definition.resolvePolicyFacts?.(input, { run }) ?? null;
}
