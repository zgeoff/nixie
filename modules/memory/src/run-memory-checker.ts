import { renderPrompt } from '@heynixie/prompts';
import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { pickCheckerReviewReason } from './pick-checker-review-reason';
import type { QuoteEvidenceResult } from './read-quote-evidence';
import { renderCheckerInput } from './render-checker-input';
import { toCheckerJSON } from './to-checker-json';
import type { MemoryContext } from './types';

export type FoundEvidence = Extract<QuoteEvidenceResult, { readonly status: 'found' }>;

export async function runMemoryChecker(
  context: Pick<MemoryContext, 'gate'>,
  request: ContentGateRequest,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const inForce = context.gate.getPromptsInForce();

  const answer = await context.gate.check({
    prompt: renderPrompt(
      'content-checker',
      { owner: { name: context.gate.ownerName } },
      inForce.prompts,
    ),
    input: renderCheckerInput(
      found.message,
      found.evidence,
      { kind: 'candidate_memory', text: request.text, until: request.until },
      context.gate.defaultZone,
    ),
  });

  const checks = {
    quote: 'pass',
    tokens: 'pass',
    checker: toCheckerJSON(answer, inForce.snapshotHash),
  };

  const detail = { evidence: found.evidence, checks, checkerReason: answer.reason };

  if (answer.verdict !== 'asserted') {
    return buildGateReview(pickCheckerReviewReason(answer), detail);
  }

  if (request.isPinned) {
    return buildGateReview('pinned', detail);
  }

  return { status: 'pass', source: 'owner', evidence: found.evidence, checks };
}
