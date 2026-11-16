import type { JSONObject } from '@heynixie/log';
import { readOwnerMessages } from '../owner/read-owner-messages';
import { collectTypedSegments } from '../typed/collect-typed-segments';
import type { MemoryContext } from '../types';
import { buildGateReview } from './build-gate-review';
import { buildGatedText } from './build-gated-text';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest, ContentGateResult } from './gate-context';

const invisible = /\p{Cf}/u;

export async function runRuleGate(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: ContentGateRequest,
  rule: JSONObject,
): Promise<ContentGateResult> {
  const gatedText = buildGatedText(request);

  if (invisible.test(gatedText)) {
    return buildGateReview('invisible_character', { checks: { rule, tokens: 'fail' } });
  }

  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => collectTypedSegments(message)).join('\n');

  if (findMissingToken(gatedText, typed) !== null) {
    return buildGateReview('token_missing', { checks: { rule, tokens: 'fail' } });
  }

  return { status: 'pass', source: 'untrusted', evidence: null, checks: { rule, tokens: 'pass' } };
}
