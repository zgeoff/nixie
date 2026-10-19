import type { Log } from '@heynixie/log';
import type { DestinationToken } from './find-destination-tokens';
import { findMissingToken } from './find-missing-token';
import { findTypedSegments } from './find-typed-segments';
import { readOwnerMessages } from './read-owner-messages';

export interface UntypedTokenQuery {
  // the thread whose latest messages from you the check reads, and how many it reads
  readonly thread: string;
  readonly limit: number;

  // the text to check
  readonly text: string;

  // text that counts as yours beside what you typed, such as your definitions
  readonly ownText: string;
}

// Reads your latest messages on the thread from the log, and returns the first destination-like
// token in the text that appears neither in what you typed there nor in your own text, or null. It
// is the token check that memory writes under an allow rule run, for a write that no quote backs.
export async function checkUntypedToken(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: UntypedTokenQuery,
): Promise<DestinationToken | null> {
  const messages = await readOwnerMessages(log, { thread: query.thread, limit: query.limit });

  const typed = messages.flatMap((message) => findTypedSegments(message)).join('\n');

  return findMissingToken(query.text, `${typed}\n${query.ownText}`);
}
