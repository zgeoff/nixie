import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { runQuotedGate } from './run-quoted-gate';
import { runRuleGate } from './run-rule-gate';
import type { MemoryContext } from './types';

// Runs the content gate outside any transaction: quote, tokens, then checker, and the first that
// fails becomes the review reason. A pinning write waits for review even when every check passes,
// and your allow rule on memory.remember leaves only the token check.
export async function runContentGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
): Promise<ContentGateResult> {
  if (invisible.test(request.text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }
  const rule = await context.gate.findAllowRule({
    tool: 'memory.remember',
    thread: request.thread,
  });

  if (rule !== null) {
    return runRuleGate(context, request, { id: rule.ruleID, revision: rule.revision });
  }
  if (request.quote === null) {
    return buildGateReview('no_quote', { checks: { quote: 'fail' } });
  }
  return runQuotedGate(context, request, request.quote);
}

// Unicode format characters: zero-width spaces and joiners, bidirectional controls, the byte order
// mark and the soft hyphen
const invisible = /\p{Cf}/u;
