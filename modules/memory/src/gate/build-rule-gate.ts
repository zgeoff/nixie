import { buildGateReview } from './build-gate-review';
import { buildGatedText } from './build-gated-text';
import type { ContentGateRequest, ContentGateResult } from './gate-context';
import type { CoveringRule } from './pick-covering-rule';

const invisible = /\p{Cf}/u;

// An allow rule that covers a write is the user's consent to it, so the gate runs the
// hidden-character check and nothing else: no quote check, no checker and no token check.
export function buildRuleGate(
  request: Pick<ContentGateRequest, 'text' | 'labelTexts'>,
  rule: CoveringRule,
): ContentGateResult {
  const covering = { id: rule.id, revision: rule.revision };

  if (invisible.test(buildGatedText(request))) {
    return buildGateReview('invisible_character', { checks: { rule: covering, tokens: 'fail' } });
  }

  return { status: 'pass', source: 'untrusted', evidence: null, checks: { rule: covering } };
}
