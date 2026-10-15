import type { JSONObject } from '@heynixie/log';
import { buildGateReview } from './build-gate-review';
import { findMissingToken } from './find-missing-token';
import { findTypedSegments } from './find-typed-segments';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryContext } from './types';

// The gate under your allow rule: only the token check runs, against everything you typed in your
// latest messages. No quote backs the write, so it takes the least trusted source in the calling
// task's context, which is outside content for the conversation and every task.
export async function runRuleGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  rule: JSONObject,
): Promise<ContentGateResult> {
  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => findTypedSegments(message)).join('\n');

  if (findMissingToken(request.text, typed) !== null) {
    return buildGateReview('token_missing', { checks: { rule, tokens: 'fail' } });
  }

  if (request.isPinned) {
    return buildGateReview('pinned', { checks: { rule, tokens: 'pass' } });
  }

  return { status: 'pass', source: 'untrusted', evidence: null, checks: { rule, tokens: 'pass' } };
}
