import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { PageSession } from './get-page-session';
import { probeSessionEnded } from './probe-session-ended';
import { writeLinkNumbers } from './write-link-numbers';

export function writeHitLinks(
  log: Pick<Log, 'writer'>,
  session: PageSession,
  urls: readonly string[],
): Promise<ReadonlyMap<string, number> | null> {
  return withWriteTransaction(log.writer, async (tx) => {
    const hasEnded = await probeSessionEnded(tx, session);

    return hasEnded
      ? null
      : writeLinkNumbers(tx, { sessionKey: session.sessionKey, thread: session.thread, urls });
  });
}
