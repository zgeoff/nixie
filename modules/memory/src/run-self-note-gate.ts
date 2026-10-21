import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readTokenVerdict } from './read-token-verdict';
import type { MemoryContext } from './types';

const invisible = /\p{Cf}/u;

export async function runSelfNoteGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: Pick<ContentGateRequest, 'text' | 'thread'>,
): Promise<ContentGateResult> {
  if (invisible.test(request.text)) {
    return buildGateReview('invisible_character', { checks: { tokens: 'fail' } });
  }

  const tokens = await readTokenVerdict(context, request);

  return buildGateReview('self_note', { checks: { tokens } });
}
