import { renderPrompt } from '@heynixie/prompts';
import { pickCheckerReviewReason } from '../checker/pick-checker-review-reason';
import { renderCheckerInput } from '../checker/render-checker-input';
import type { QuoteEvidenceResult } from '../evidence/read-quote-evidence';
import { buildGateReview } from '../gate/build-gate-review';
import type { ContentGateRequest, ContentGateResult } from '../gate/gate-context';
import type { MemoryContext } from '../types';
import { toCheckerJSON } from '../utils/checker/to-checker-json';

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
