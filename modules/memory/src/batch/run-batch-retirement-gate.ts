import { readSourceEvidence } from '../evidence/read-source-evidence';
import { buildAskReview } from '../gate/build-ask-review';
import { buildGateReview } from '../gate/build-gate-review';
import { pickCoveringRule } from '../gate/pick-covering-rule';
import { readItemText } from '../item/read-item-text';
import { runRetirementChecker } from '../retirement/run-retirement-checker';
import type { StoreParts } from '../types';
import type { SourceMessage, StagedWrite } from '../writer/writer-model';
import type { BatchGateResult } from './run-batch-gate';

export async function runBatchRetirementGate(
  parts: StoreParts,
  write: Extract<StagedWrite, { readonly op: 'retire' }>,
  source: SourceMessage,
): Promise<BatchGateResult> {
  const retired = await readItemText(parts, write.target, 'retire');

  const verdict = write.verdict;

  if (verdict?.kind === 'rule-ask') {
    return { gate: buildAskReview(verdict.rule), text: retired.text };
  }

  const covering = pickCoveringRule(verdict, 'none');

  if (covering !== null) {
    return {
      gate: {
        status: 'pass',
        source: 'untrusted',
        evidence: null,
        checks: { rule: { id: covering.id, revision: covering.revision } },
      },
      text: retired.text,
    };
  }

  const found = await readSourceEvidence(parts.context.log, source, write.quote);

  if (found.status === 'review') {
    return {
      gate: buildGateReview(found.reason, { checks: { read: 'pass', quote: 'fail' } }),
      text: retired.text,
    };
  }

  return {
    gate: await runRetirementChecker(parts.context, retired.text, found),
    text: retired.text,
  };
}
