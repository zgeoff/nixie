import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { WebFetchTables } from './web-fetch-tables';

// Removes every link the thread's sessions numbered, so a forget leaves no URL a page showed.
export async function removeThreadLinks(log: Pick<Log, 'writer'>, thread: string): Promise<void> {
  await withWriteTransaction(log.writer, (tx) =>
    tx
      .$extendTables<WebFetchTables>()
      .deleteFrom('web_fetch_links')
      .where('thread', '=', thread)
      .execute(),
  );
}
