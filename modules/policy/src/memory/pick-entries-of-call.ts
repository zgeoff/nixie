import type { PolicyCall, RuleEntry } from '../types';
import { isActionHeldMemoryTool } from './is-action-held-memory-tool';
import { isNeedMet } from './is-need-met';

// A move that touches a self-note holds for the user unless an allow rule checks subject eq self,
// so an allow rule with no such check leaves the rules the call meets.
export function pickEntriesOfCall(
  entries: readonly RuleEntry[],
  call: Pick<PolicyCall, 'tool' | 'args'>,
): readonly RuleEntry[] {
  if (!isActionHeldMemoryTool(call.tool) || !isSelfMentioned(call.args['subject'])) {
    return entries;
  }

  return entries.filter(
    (entry) =>
      entry.rule.outcome !== 'allow' || isNeedMet({ checks: entry.rule.checks ?? [] }, 'self_note'),
  );
}

function isSelfMentioned(subject: unknown): boolean {
  return Array.isArray(subject) ? subject.includes('self') : subject === 'self';
}
