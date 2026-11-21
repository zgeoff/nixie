import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import { ownerMessageCodec } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { encodeTestImage } from './encode-test-image';

export interface OwnerPhotoSeed {
  readonly thread: string;
  readonly width: number;
  readonly height: number;
}

// Writes an owner message with one PNG photo, and returns the sequence of its record.
export async function seedOwnerPhoto(log: Log, photo: OwnerPhotoSeed): Promise<number> {
  const encoded = await encodeTestImage(photo, 'png');

  const bytes = new Uint8Array(encoded);

  const [record] = await writeRecords(log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: photo.thread,
      contentSource: 'owner',
      payload: ownerMessageCodec.encode({
        identityID: 'identity-test',
        spans: 'as_sent',
        images: [{ mediaType: 'image/png' }],
      }),
      erasable: { text: 'a photo', spans: [] },
      attachments: [bytes],
    },
  ]);

  invariant(record, 'the log wrote no owner_message record');

  return record.sequence;
}
