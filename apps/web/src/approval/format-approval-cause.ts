import { formatReviewReason } from '../proposal/format-review-reason';
import type { MemoryProposal } from '../types';

interface CauseFacts {
  readonly proposal: { readonly cause: string };
  readonly body: { readonly memory?: Pick<MemoryProposal, 'reason'> | undefined };
}

const causes: Readonly<Record<string, string>> = {
  direct_request: 'you asked for it, and a rule asks first.',
  repeat: 'it repeats an action you answered before.',
  outside_steering: 'it follows something nixie read outside your own words.',
  always_ask: 'this kind of action always asks.',
  ask_rule: 'a rule of yours asks before it.',
  no_rule: 'no rule covers it yet.',
  condition_error: 'the condition of a rule failed to run, so the call asks.',
  skill_write: 'nixie wants to change one of its skills.',
  proposed_rule: 'you approved this kind of action 3 times, so nixie suggests a rule for it.',
  mandate: 'a mandate lets nixie act on its own until it ends.',
  mcp_config: 'your config adds an MCP server or widens what one may do.',
  mcp_allow: 'an MCP server changed a tool so that it takes input it did not take before.',
  rule_widening: 'the change lets a rule through that it did not before.',
};

// The plain words for why a proposal waits. A cause this client does not know reads as a generic
// reason, because a newer release can add one.
export function formatApprovalCause(item: CauseFacts): string {
  const memory = item.body.memory;

  if (memory !== undefined) {
    return formatReviewReason(memory.reason);
  }

  return causes[item.proposal.cause] ?? 'it needs your answer.';
}
