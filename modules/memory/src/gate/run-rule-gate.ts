import type { JSONObject } from '@heynixie/log';
import { readOwnerMessages } from '../owner/read-owner-messages';
import { collectTypedSegments } from '../typed/collect-typed-segments';
import type { MemoryContext } from '../types';
import { buildGateReview } from './build-gate-review';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest, ContentGateResult } from './gate-context';

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
