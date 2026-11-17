import { readEventEvidence } from '../evidence/read-event-evidence';
import { readQuoteEvidence } from '../evidence/read-quote-evidence';
import type { MemoryContext } from '../types';
import { buildGateReview } from './build-gate-review';
import { buildGatedText } from './build-gated-text';
import type { ContentGateRequest, ContentGateResult } from './gate-context';
import { runQuotedGate } from './run-quoted-gate';

const invisible = /\p{Cf}/u;

// The gate of a write that no allow rule covers: the hidden-character check, the quote check, then
// the memory checker.
export async function runContentGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
): Promise<ContentGateResult> {
  if (invisible.test(buildGatedText(request))) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  if (request.quote === null) {
    return buildGateReview('no_quote', { checks: { quote: 'fail' } });
  }

  const found =
    request.eventID === null
      ? await readQuoteEvidence(context.log, {
          thread: request.thread,
          quote: request.quote,
          window: context.gate.limits.evidenceWindow,
        })
      : await readEventEvidence(context.log, {
          thread: request.logThread,
          quote: request.quote,
          eventID: request.eventID,
        });

  return runQuotedGate(context, request, { quote: request.quote, found });
}
