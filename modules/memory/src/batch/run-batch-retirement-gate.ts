import { readSourceEvidence } from '../evidence/read-source-evidence';
import { buildGateReview } from '../gate/build-gate-review';
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
