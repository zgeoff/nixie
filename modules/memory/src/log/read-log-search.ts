import type { Log } from '@heynixie/log';
import type { LogPageQuery, LogPageRead } from './read-log-page';
import { readLogPageWithSpan } from './read-log-page';

// Reads pages in turn while each one holds no entry and more records remain, until the reads have
// decrypted maxScanned records. The result is the last page, with the span of every record read.
export async function readLogSearch(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  query: LogPageQuery,
  taskNames: ReadonlyMap<string, string>,
  maxScanned: number,
): Promise<LogPageRead> {
  let page = await readLogPageWithSpan(log, query, taskNames);

  let scanned = page.scanned;
  let searched = page.searched;

  while (page.entries.length === 0 && page.next !== null && scanned < maxScanned) {
    page = await readLogPageWithSpan(log, { ...query, after: page.next }, taskNames);

    scanned += page.scanned;

    if (searched !== null && page.searched !== null) {
      searched = { fromAt: searched.fromAt, throughAt: page.searched.throughAt };
    }

    searched ??= page.searched;
  }

  return { ...page, scanned, searched };
}
