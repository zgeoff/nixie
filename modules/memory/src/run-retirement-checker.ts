import { renderPrompt } from '@heynixie/prompts';
import { buildGateReview } from './build-gate-review';
import type { ContentGateResult } from './gate-types';
import { pickCheckerReviewReason } from './pick-checker-review-reason';
import { renderCheckerInput } from './render-checker-input';
import type { FoundEvidence } from './run-memory-checker';
import type { MemoryContext } from './types';

export async function runRetirementChecker(
  context: Pick<MemoryContext, 'gate'>,
  itemText: string,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const answer = await context.gate.check({
    prompt: renderPrompt('retirement-checker', {}, context.gate.getPrompts()),
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
    checker: { verdict: answer.verdict, model: answer.model, failure: answer.failure },
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
