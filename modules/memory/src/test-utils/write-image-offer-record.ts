import type { Log, LogTables } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';

export interface ImageOfferRecord {
  readonly thread: string;

  // the message that holds the image, and the image's number in it, from 1
  readonly messageSequence: number;
  readonly image: number;

  // the text the model offered to save
  readonly text: string;
}

export interface WrittenImageOffer {
  readonly sequence: number;

  // the key the record's erasable fields are sealed under
  readonly keyID: string;
}

// Writes a memory.image_offered record as an earlier release's image offer wrote one: the image in
// the plain payload, and the offered text sealed under the record's own key. It returns the
// record's sequence and its key.
export async function writeImageOfferRecord(
  log: Log,
  offer: ImageOfferRecord,
): Promise<WrittenImageOffer> {
  const [record] = await writeRecords(log, [
    {
      kind: 'memory.image_offered',
      definitions: { snapshotHash: 'sha256:test' },
      thread: offer.thread,
      payload: { messageSequence: offer.messageSequence, image: offer.image, runID: 'run-offer' },
      erasable: { text: offer.text },
    },
  ]);

  invariant(record, 'the log wrote no memory.image_offered record');

  const row = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', record.sequence)
    .executeTakeFirstOrThrow();

  invariant(row.key_id !== null, 'the offer record has no key');

  return { sequence: record.sequence, keyID: row.key_id };
}
