import { buildGateReview } from './build-gate-review';
import { collectTypedSegments } from './collect-typed-segments';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryContext } from './types';

// Unicode format characters, as the content gate refuses them
const invisible = /\p{Cf}/u;

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

  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => collectTypedSegments(message)).join('\n');
  const tokens = findMissingToken(request.text, typed) === null ? 'pass' : 'fail';

  return buildGateReview('self_note', { checks: { tokens } });
}
