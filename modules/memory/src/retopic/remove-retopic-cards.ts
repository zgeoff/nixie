import type { LogTables } from '@heynixie/log';
import { readRecordAttachments, readRecords, removeRecordKey } from '@heynixie/log';
import type { StoreParts } from '../types';
import { readRecordKeyID } from '../utils/read-record-key-id';
import { parseRetopicCard } from './parse-retopic-card';

const pageSize = 200;

// A held move stores the gist of each item it names under the call's own key, which a forget of the
// item never reaches. This removes the key of each call whose card names the item, so no copy of
// the gist outlives the item, and the card then shows no body.
export async function removeRetopicCards(
  parts: Pick<StoreParts, 'context'>,
  itemID: string,
): Promise<void> {
  const log = parts.context.log;

  const rows = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('record_attachments')
    .innerJoin('records', 'records.sequence', 'record_attachments.sequence')
    .select('records.sequence')
    .distinct()
    .where('records.kind', '=', 'tool_called')
    .execute();

  for (let start = 0; start < rows.length; start += pageSize) {
    const sequences = rows.slice(start, start + pageSize).map((row) => row.sequence);

    const calls = await readRecords(log, {
      afterSequence: 0,
      kinds: ['tool_called'],
      sequences,
      limit: pageSize,
    });

    const retopics = calls
      .filter((entry) => entry.record.payload['tool'] === 'memory.retopic')
      .map((entry) => entry.record.sequence);

    const attached = await readRecordAttachments(log, retopics);

    for (const [sequence, card] of attached) {
      const bytes = card.status === 'readable' ? card.attachments[0] : undefined;
      const items = bytes === undefined ? null : parseRetopicCard(bytes);

      if (items?.includes(itemID) === true) {
        const keyID = await readRecordKeyID(log, sequence);

        if (keyID !== null) {
          await removeRecordKey(log, keyID);
        }
      }
    }
  }
}
