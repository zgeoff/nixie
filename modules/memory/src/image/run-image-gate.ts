import { buildGateReview } from '../gate/build-gate-review';
import type { ContentGateRequest, ContentGateResult } from '../gate/gate-context';
import type { CoveringRule } from '../gate/pick-covering-rule';
import { readTokenVerdict } from '../gate/read-token-verdict';
import { runRuleGate } from '../gate/run-rule-gate';
import type { MemoryContext } from '../types';

const invisible = /\p{Cf}/u;

// An allow rule that checks the image argument covers a photo write, which then takes the token
// check only.
export async function runImageGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  rule: CoveringRule | null,
): Promise<ContentGateResult> {
  if (invisible.test(request.text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  if (rule !== null) {
    return runRuleGate(context, request, { id: rule.id, revision: rule.revision });
  }

  const tokens = await readTokenVerdict(context, request);

  return buildGateReview('from_photo', { checks: { tokens } });
}
