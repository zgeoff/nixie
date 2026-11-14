import { toOwnerMessage } from '../evidence/read-source-evidence';
import { buildGateReview } from '../gate/build-gate-review';
import { findMissingToken } from '../gate/find-missing-token';
import type { ContentGateResult } from '../gate/gate-context';
import type { CoveringRule } from '../gate/pick-covering-rule';
import { collectTypedSegments } from '../typed/collect-typed-segments';
import type { SourceMessage } from '../writer/writer-model';

export interface BatchRuleWrite {
  readonly text: string;
  readonly isPinned: boolean;
}

// An allow rule that covers a batch write skips the quote check and the memory checker. The token
// check runs against the words the owner typed in the one message the write cites.
export function runBatchRuleGate(
  write: BatchRuleWrite,
  source: SourceMessage,
  rule: CoveringRule,
): ContentGateResult {
  const ruleChecks = { id: rule.id, revision: rule.revision };
  const typed = collectTypedSegments(toOwnerMessage(source)).join('\n');

  if (findMissingToken(write.text, typed) !== null) {
    return buildGateReview('token_missing', { checks: { rule: ruleChecks, tokens: 'fail' } });
  }

  if (write.isPinned) {
    return buildGateReview('pinned', { checks: { rule: ruleChecks, tokens: 'pass' } });
  }

  return {
    status: 'pass',
    source: 'untrusted',
    evidence: null,
    checks: { rule: ruleChecks, tokens: 'pass' },
  };
}
