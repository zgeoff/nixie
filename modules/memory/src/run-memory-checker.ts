import type { JSONObject } from '@heynixie/log';
import type { CheckerAnswer } from '@heynixie/models';
import { buildGateReview } from './build-gate-review';
import type { QuoteEvidenceResult } from './find-quote-evidence';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { pickCheckerReviewReason } from './pick-checker-review-reason';
import { renderCheckerInput } from './render-checker-input';
import { renderMemoryCheckerPrompt } from './render-memory-checker-prompt';
import type { MemoryContext } from './types';

export type FoundEvidence = Extract<QuoteEvidenceResult, { readonly status: 'found' }>;

// Asks the memory checker whether the quote asserts the memory. A write passes only on an asserted
// verdict, and a pinning write waits for review even then.
export async function runMemoryChecker(
  context: Pick<MemoryContext, 'gate'>,
  request: ContentGateRequest,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const answer = await context.gate.check({
    prompt: renderMemoryCheckerPrompt(context.gate.ownerName),
    input: renderCheckerInput(found.message, found.evidence, {
      kind: 'candidate_memory',
      text: request.text,
    }),
  });

  const checks = { quote: 'pass', tokens: 'pass', checker: toCheckerJSON(answer) };
  const detail = { evidence: found.evidence, checks, checkerReason: answer.reason };

  if (answer.verdict !== 'asserted') {
    return buildGateReview(pickCheckerReviewReason(answer), detail);
  }

  if (request.isPinned) {
    return buildGateReview('pinned', detail);
  }

  return { status: 'pass', source: 'owner', evidence: found.evidence, checks };
}

// the checker's reason text is free text that may repeat the memory, so it stays out of the plain
// checks and reaches only the sealed proposal
function toCheckerJSON(answer: CheckerAnswer): JSONObject {
  return { verdict: answer.verdict, model: answer.model, failure: answer.failure };
}
