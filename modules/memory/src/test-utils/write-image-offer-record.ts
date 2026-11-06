import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { readTestRecordRows } from '@heynixie/log/test-utils';
import invariant from 'tiny-invariant';

export interface ImageOfferRecord {
  readonly thread: string;

  readonly messageSequence: number;
  readonly image: number;

  readonly text: string;
}

export interface WrittenImageOffer {
  readonly sequence: number;

  readonly keyID: string;
}

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

  const rows = await readTestRecordRows(log);

  const keyID = rows.find((row) => row.sequence === record.sequence)?.key_id;

  invariant(typeof keyID === 'string', 'the offer record has no key');

  return { sequence: record.sequence, keyID };
}
