import { buildGateReview } from './build-gate-review';
import { findMissingToken } from './find-missing-token';
import { findQuoteEvidence } from './find-quote-evidence';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { runMemoryChecker } from './run-memory-checker';
import type { MemoryContext } from './types';

// The gate for a write with a quote: the quote must be one you typed, the memory's tokens must
// appear in it, and the checker must find the quote asserts the memory.
export async function runQuotedGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  quote: string,
): Promise<ContentGateResult> {
  const found = await findQuoteEvidence(context.log, {
    thread: request.thread,
    quote,
    window: context.gate.limits.evidenceWindow,
  });

  if (found.status === 'review') {
    return buildGateReview(found.reason, { checks: { quote: 'fail' } });
  }
  if (findMissingToken(request.text, quote) !== null) {
    return buildGateReview('token_missing', {
      evidence: found.evidence,
      checks: { quote: 'pass', tokens: 'fail' },
    });
  }
  return runMemoryChecker(context, request, found);
}
