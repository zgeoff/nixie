import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { removeWebFetchPages } from './remove-web-fetch-pages';
import type { WebFetchTables } from './web-fetch-tables';

export async function removeWebFetchThread(
  log: Pick<Log, 'writer'>,
  thread: string,
): Promise<void> {
  await withWriteTransaction(log.writer, async (tx) => {
    await tx
      .$extendTables<WebFetchTables>()
      .deleteFrom('web_fetch_links')
      .where('thread', '=', thread)
      .execute();

    await removeWebFetchPages(tx, { kind: 'thread', thread });
  });
}
