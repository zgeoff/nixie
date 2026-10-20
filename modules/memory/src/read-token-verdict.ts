import { findMissingToken } from './find-missing-token';
import { findTypedSegments } from './find-typed-segments';
import type { ContentGateRequest } from './gate-types';
import { readOwnerMessages } from './read-owner-messages';
import type { MemoryContext } from './types';

// The token check of a write that no quote of yours backs: it passes when every number, address,
// handle and link of the text appears in what you typed in your latest messages.
export async function readTokenVerdict(
  context: Pick<MemoryContext, 'log' | 'gate'>,
  request: Pick<ContentGateRequest, 'text' | 'thread'>,
): Promise<'pass' | 'fail'> {
  const messages = await readOwnerMessages(context.log, {
    thread: request.thread,
    limit: context.gate.limits.evidenceWindow,
  });

  const typed = messages.flatMap((message) => findTypedSegments(message)).join('\n');

  return findMissingToken(request.text, typed) === null ? 'pass' : 'fail';
}
