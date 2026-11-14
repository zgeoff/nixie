import { readOwnerMessages } from '../owner/read-owner-messages';
import { collectTypedSegments } from '../typed/collect-typed-segments';
import type { MemoryContext } from '../types';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest } from './gate-context';

export async function readTokenVerdict(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: Pick<ContentGateRequest, 'text' | 'thread'>,
): Promise<'pass' | 'fail'> {
  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => collectTypedSegments(message)).join('\n');

  return findMissingToken(request.text, typed) === null ? 'pass' : 'fail';
}
