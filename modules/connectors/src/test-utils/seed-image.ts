import type { Log } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { writeImageRow } from '../image/write-image-row';

export interface ImageSeed {
  readonly image: string;
  readonly source: 'draw' | 'file' | 'photo';

  // the record an import came from
  readonly sourceSequence?: number;
  readonly bytes: Uint8Array<ArrayBuffer>;

  // the image an edit started from
  readonly from?: string;

  // what the call drew; an import has none
  readonly prompt?: string;
  readonly isPinned?: boolean;
  readonly createdAtMs?: number;
}

export interface SeededImage {
  // the tool_called record of the image
  readonly callSequence: number;

  // the tool_result record that holds the bytes
  readonly sequence: number;

  // the UUID of the images row, which a session can name the image by
  readonly uuid: string;
}

// Writes the tool_called and tool_result records that hold the bytes and the prompt, and the images
// row that names the result, as an image tool leaves them.
export function seedImage(log: Log, seed: ImageSeed): Promise<SeededImage> {
  return withWriteTransaction(log.writer, async (tx) => {
    const [call] = await writeRecordsInTransaction(tx, log, [
      {
        kind: 'tool_called',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {
          callID: `call-${seed.image}`,
          runID: 'run-1',
          toolUseID: null,
          tool: seed.source === 'draw' ? 'image.draw' : 'image.import',
        },
        erasable: { input: seed.prompt === undefined ? {} : { prompt: seed.prompt } },
      },
    ]);

    invariant(call, 'the log wrote the call record');

    const [record] = await writeRecordsInTransaction(tx, log, [
      {
        kind: 'tool_result',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        parent: call.sequence,
        payload: {
          callID: `call-${seed.image}`,
          runID: 'run-1',
          toolUseID: null,
          outcome: 'result',
          actionID: null,
          sources: {},
        },
        erasable: {
          result: {
            image: seed.image,
            ...(seed.prompt === undefined ? {} : { prompt: seed.prompt }),
          },
        },
        attachments: [seed.bytes],
      },
    ]);

    invariant(record, 'the log wrote the result record');

    const uuid = crypto.randomUUID();

    await writeImageRow(tx, {
      image_id: seed.image,
      uuid,
      sequence: record.sequence,
      position: 0,
      parent_id: seed.from ?? null,
      source: seed.source,
      source_seq: seed.sourceSequence ?? null,
      is_pinned: seed.isPinned === true ? 1 : 0,
      profile: null,
      model: null,
      media_type: 'image/png',
      size: '64x48',
      byte_count: seed.bytes.byteLength,
      created_at: seed.createdAtMs ?? 1,
    });

    return { callSequence: call.sequence, sequence: record.sequence, uuid };
  });
}
