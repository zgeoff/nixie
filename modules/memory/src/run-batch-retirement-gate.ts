import { buildGateReview } from './build-gate-review';
import { readItemText } from './read-item-text';
import { readSourceEvidence } from './read-source-evidence';
import type { BatchGateResult } from './run-batch-gate';
import { runRetirementChecker } from './run-retirement-checker';
import type { StoreParts } from './types';
import type { SourceMessage, StagedWrite } from './writer-types';

export async function runBatchRetirementGate(
  parts: StoreParts,
  write: Extract<StagedWrite, { readonly op: 'retire' }>,
  source: SourceMessage,
): Promise<BatchGateResult> {
  const retired = await readItemText(parts, write.target, 'retire');
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
