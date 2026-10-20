import { buildGateReview } from './build-gate-review';
import type { AllowRuleCall, ContentGateRequest, ContentGateResult } from './gate-types';
import { readEventEvidence } from './read-event-evidence';
import { readQuoteEvidence } from './read-quote-evidence';
import { runQuotedGate } from './run-quoted-gate';
import { runRuleGate } from './run-rule-gate';
import type { MemoryContext } from './types';

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;

// Runs the content gate outside any transaction: quote, tokens, then checker, and the first that
// fails becomes the review reason. A pinning write waits for review even when every check passes,
// and your allow rule on the write's own tool leaves only the token check.
export async function runContentGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  tool: AllowRuleCall['tool'],
): Promise<ContentGateResult> {
  if (invisible.test(request.text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  const rule = await context.gate.findAllowRule({
    tool,
    thread: request.thread,
  });

  if (rule !== null) {
    return runRuleGate(context, request, { id: rule.ruleID, revision: rule.revision });
  }

  if (request.quote === null) {
    return buildGateReview('no_quote', { checks: { quote: 'fail' } });
  }

  // a quote that cites an event ID is checked against that record alone, however old
  const found =
    request.eventID === null
      ? await readQuoteEvidence(context.log, {
          thread: request.thread,
          quote: request.quote,
          window: context.gate.limits.evidenceWindow,
        })
      : await readEventEvidence(context.log, {
          thread: request.thread,
          quote: request.quote,
          eventID: request.eventID,
        });

  return runQuotedGate(context, request, { quote: request.quote, found });
}
