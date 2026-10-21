import type { Log } from '@heynixie/log';
import type { DestinationToken } from './collect-destination-tokens';
import { collectTypedSegments } from './collect-typed-segments';
import { findMissingToken } from './find-missing-token';
import { readOwnerMessages } from './read-owner-messages';

export interface UntypedTokenQuery {
  readonly thread: string;
  readonly limit: number;

  readonly text: string;

  readonly ownText: string;
}

export async function checkUntypedToken(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: UntypedTokenQuery,
): Promise<DestinationToken | null> {
  const messages = await readOwnerMessages(log, { thread: query.thread, limit: query.limit });

  const typed = messages.flatMap((message) => collectTypedSegments(message)).join('\n');

  return findMissingToken(query.text, `${typed}\n${query.ownText}`);
}
