import type { Log } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { WebFetchTables } from './web-fetch-tables';

export async function removeThreadLinks(log: Pick<Log, 'writer'>, thread: string): Promise<void> {
  await withWriteTransaction(log.writer, (tx) =>
    tx
      .$extendTables<WebFetchTables>()
      .deleteFrom('web_fetch_links')
      .where('thread', '=', thread)
      .execute(),
  );
}
