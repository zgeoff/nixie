import { readEventEvidence } from '../evidence/read-event-evidence';
import { readQuoteEvidence } from '../evidence/read-quote-evidence';
import type { MemoryContext } from '../types';
import { buildGateReview } from './build-gate-review';
import { buildGatedText } from './build-gated-text';
import type { ContentGateRequest, ContentGateResult } from './gate-context';
import type { CoveringRule } from './pick-covering-rule';
import { runQuotedGate } from './run-quoted-gate';
import { runRuleGate } from './run-rule-gate';

const invisible = /\p{Cf}/u;

// An allow rule that covers the write skips the quote check and the memory checker.
export async function runContentGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  rule: CoveringRule | null,
): Promise<ContentGateResult> {
  if (invisible.test(buildGatedText(request))) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  if (rule !== null) {
    return runRuleGate(context, request, { id: rule.id, revision: rule.revision });
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
