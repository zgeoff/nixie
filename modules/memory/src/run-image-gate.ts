import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readTokenVerdict } from './read-token-verdict';
import { runRuleGate } from './run-rule-gate';
import type { MemoryContext } from './types';

// Unicode format characters, as the content gate refuses them
const invisible = /\p{Cf}/u;

// The gate for a remember from a photo of yours, which is never your words, so it waits for your
// review with the photo reason whatever its quote. Only your allow rule that names the image source
// lets it apply, under that rule's token check; a rule on memory.remember alone never covers it.
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
