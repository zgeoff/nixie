import type { JSONObject } from '@heynixie/log';
import { renderPrompt } from '@heynixie/prompts';
import type { CheckerAnswer } from '@heynixie/sessions';
import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { pickCheckerReviewReason } from './pick-checker-review-reason';
import type { QuoteEvidenceResult } from './read-quote-evidence';
import { renderCheckerInput } from './render-checker-input';
import type { MemoryContext } from './types';

export type FoundEvidence = Extract<QuoteEvidenceResult, { readonly status: 'found' }>;

export async function runMemoryChecker(
  context: Pick<MemoryContext, 'gate'>,
  request: ContentGateRequest,
  found: FoundEvidence,
): Promise<ContentGateResult> {
  const answer = await context.gate.check({
    prompt: renderPrompt(
      'content-checker',
      { owner: { name: context.gate.ownerName } },
      context.gate.getPrompts(),
    ),
    input: renderCheckerInput(
      found.message,
      found.evidence,
      { kind: 'candidate_memory', text: request.text, until: request.until },
      context.gate.defaultZone,
    ),
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

function toCheckerJSON(answer: CheckerAnswer): JSONObject {
  return { verdict: answer.verdict, model: answer.model, failure: answer.failure };
}
