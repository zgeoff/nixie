import { buildGateReview } from './build-gate-review';
import type { AllowRuleCall, ContentGateRequest, ContentGateResult } from './gate-types';
import { readEventEvidence } from './read-event-evidence';
import { readQuoteEvidence } from './read-quote-evidence';
import { runQuotedGate } from './run-quoted-gate';
import { runRuleGate } from './run-rule-gate';
import type { MemoryContext } from './types';

const invisible = /\p{Cf}/u;

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
