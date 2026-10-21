import type { JSONObject } from '@heynixie/log';
import { buildGateReview } from './build-gate-review';
import { collectTypedSegments } from './collect-typed-segments';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest, ContentGateResult } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryContext } from './types';

export async function runRuleGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  rule: JSONObject,
): Promise<ContentGateResult> {
  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => collectTypedSegments(message)).join('\n');

  if (findMissingToken(request.text, typed) !== null) {
    return buildGateReview('token_missing', { checks: { rule, tokens: 'fail' } });
  }

  if (request.isPinned) {
    return buildGateReview('pinned', { checks: { rule, tokens: 'pass' } });
  }

  return { status: 'pass', source: 'untrusted', evidence: null, checks: { rule, tokens: 'pass' } };
}
