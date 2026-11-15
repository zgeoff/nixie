import type { PolicyDecision } from '@heynixie/policy';
import type { MemoryWriteVerdict } from '../types';

// An ask rule on memory_write makes the write a memory proposal, which the memory gate writes, so
// the call writes no action proposal.
export function isMemoryRuleAsk(policy: PolicyDecision): boolean {
  return (
    policy.memoryWrite !== undefined &&
    policy.decision.outcome === 'ask' &&
    policy.decision.cause === 'ask_rule' &&
    policy.decision.rule !== null
  );
}

// What the decision point said about a memory write, for the tool's own gate. A decision from a
// declaration that did not hold memory_write, such as a snapshot from before the release that
// changed it, gives no verdict, and the tool runs every check.
export function buildMemoryVerdict(policy: PolicyDecision): MemoryWriteVerdict | undefined {
  const facts = policy.memoryWrite;
  const decision = policy.decision;

  if (facts === undefined) {
    return undefined;
  }

  if (decision.outcome === 'allow' && decision.rule !== null) {
    return { kind: 'rule-allow', rules: facts.allowing };
  }

  if (isMemoryRuleAsk(policy) && decision.rule !== null) {
    return { kind: 'rule-ask', rule: { id: decision.rule.id, revision: decision.rule.revision } };
  }

  return { kind: 'gate' };
}
