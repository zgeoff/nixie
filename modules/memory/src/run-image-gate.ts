import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readTokenVerdict } from './read-token-verdict';
import { runRuleGate } from './run-rule-gate';
import type { MemoryContext } from './types';

const invisible = /\p{Cf}/u;

export async function runImageGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
): Promise<ContentGateResult> {
  if (invisible.test(request.text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  const rule = await context.gate.findAllowRule({
    tool: 'memory.remember',
    thread: request.thread,
    source: 'image',
  });

  if (rule?.source === 'image') {
    return runRuleGate(context, request, { id: rule.ruleID, revision: rule.revision });
  }

  const tokens = await readTokenVerdict(context, request);

  return buildGateReview('from_photo', { checks: { tokens } });
}
