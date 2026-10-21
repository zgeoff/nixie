import { collectTypedSegments } from './collect-typed-segments';
import { findMissingToken } from './find-missing-token';
import type { ContentGateRequest } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryContext } from './types';

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
