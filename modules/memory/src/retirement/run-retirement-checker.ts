import { renderPrompt } from '@heynixie/prompts';
import { pickCheckerReviewReason } from '../checker/pick-checker-review-reason';
import { renderCheckerInput } from '../checker/render-checker-input';
import { buildGateReview } from '../gate/build-gate-review';
import type { ContentGateResult } from '../gate/gate-context';
import type { FoundEvidence } from '../memory/run-memory-checker';
import type { MemoryContext } from '../types';
import { toCheckerJSON } from '../utils/checker/to-checker-json';

export async function runRetirementChecker(
  context: Pick<MemoryContext, 'gate'>,
  itemText: string,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const inForce = context.gate.getPromptsInForce();

  const answer = await context.gate.check({
    prompt: renderPrompt('retirement-checker', {}, inForce.prompts),
    input: renderCheckerInput(
      found.message,
      found.evidence,
      {
        kind: 'item_to_retire',
        text: itemText,
        until: null,
      },
      context.gate.defaultZone,
    ),
  });

  const checks = {
    read: 'pass',
    quote: 'pass',
    checker: toCheckerJSON(answer, inForce.snapshotHash),
  };

  if (answer.verdict === 'asserted') {
    return { status: 'pass', source: 'owner', evidence: found.evidence, checks };
  }

  return buildGateReview(pickCheckerReviewReason(answer), {
    evidence: found.evidence,
    checks,
    checkerReason: answer.reason,
  });
}
