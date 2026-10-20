import { buildGateReview } from './build-gate-review';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readTokenVerdict } from './read-token-verdict';
import type { MemoryContext } from './types';

// The gate for a self-note: no quote of yours backs it, so every one waits for your review with the
// self-note reason. The token check still runs against what you typed in your latest messages, and
// its verdict joins the proposal's checks, so the review shows a destination you never typed.
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

// Unicode format characters, as the content gate refuses them
const invisible = /\p{Cf}/u;
