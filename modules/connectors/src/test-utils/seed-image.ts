import type { Log } from '@heynixie/log';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { ImageTables } from '../image/image-tables';

export interface ImageSeed {
  readonly image: string;
  readonly source: 'draw' | 'file' | 'photo';

  // the record an import came from
  readonly sourceSequence?: number;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

// Writes a tool_result record that holds the bytes, and the images row that names it, as an image
// tool leaves them.
export async function seedImage(log: Log, seed: ImageSeed): Promise<{ readonly sequence: number }> {
  const [record] = await writeRecords(log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'run-1',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { image: seed.image } },
      attachments: [seed.bytes],
    },
  ]);

  invariant(record, 'the log wrote the result record');

  await log.writer.db
    .$extendTables<ImageTables>()
    .insertInto('images')
    .values({
      image_id: seed.image,
      uuid: crypto.randomUUID(),
      sequence: record.sequence,
      position: 0,
      parent_id: null,
      source: seed.source,
      source_seq: seed.sourceSequence ?? null,
      is_pinned: 0,
      profile: null,
      model: null,
      media_type: 'image/png',
      size: '64x48',
      byte_count: seed.bytes.byteLength,
      created_at: 1,
    })
    .execute();

  return { sequence: record.sequence };
}
