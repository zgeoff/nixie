import { buildGateReview } from './build-gate-review';
import { findSourceEvidence } from './find-source-evidence';
import { readItemText } from './read-item-text';
import type { BatchGateResult } from './run-batch-gate';
import { runRetirementChecker } from './run-retirement-checker';
import type { StoreParts } from './types';
import type { SourceMessage, StagedWrite } from './writer-types';

// Runs a batch's staged retirement through the intent checks, with the message it cites as its only
// evidence, and returns the item's text for the proposal. The writer's staging binds a retirement
// to a version the session was shown, so the read check passes by construction.
export async function runBatchRetirementGate(
  parts: StoreParts,
  write: Extract<StagedWrite, { readonly op: 'retire' }>,
  source: SourceMessage,
): Promise<BatchGateResult> {
  const retired = await readItemText(parts, write.target);
  const found = await findSourceEvidence(parts.context.log, source, write.quote);

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
