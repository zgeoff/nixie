import { buildGateReview } from './build-gate-review';
import { findMissingToken } from './find-missing-token';
import type { QuoteEvidenceResult } from './find-quote-evidence';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { runMemoryChecker } from './run-memory-checker';
import type { MemoryContext } from './types';

export interface QuotedEvidence {
  readonly quote: string;

  // where the quote's evidence lies, as the caller's lookup found it
  readonly found: QuoteEvidenceResult;
}

// The gate for a write with a quote: the quote must be one you typed, the memory's tokens must
// appear in it, and the checker must find the quote asserts the memory.
export function runQuotedGate(
  context: Pick<MemoryContext, 'gate'>,
  request: ContentGateRequest,
  quoted: QuotedEvidence,
): Promise<ContentGateResult> {
  const found = quoted.found;

  if (found.status === 'review') {
    return Promise.resolve(buildGateReview(found.reason, { checks: { quote: 'fail' } }));
  }
  if (findMissingToken(request.text, quoted.quote) !== null) {
    return Promise.resolve(
      buildGateReview('token_missing', {
        evidence: found.evidence,
        checks: { quote: 'pass', tokens: 'fail' },
      }),
    );
  }
  return runMemoryChecker(context, request, found);
}
