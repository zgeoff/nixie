import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { imageNamedCodec } from './image-named-codec';
import type { ImageEntry } from './read-image-entry';
import { readImageEntry } from './read-image-entry';
import type { ImageToolOptions } from './types';

interface ImageNameInput {
  readonly thread: string;
  readonly image: string;

  // null clears the name
  readonly name: string | null;
}

// Writes the image.named record of the image, and answers the entry it found. The entry is read in
// the write transaction, so a forget that began before it, even one whose cleanup has not run, keeps
// the name from being written.
export function writeImageName(
  options: Pick<ImageToolOptions, 'definitions' | 'log'>,
  input: ImageNameInput,
): Promise<ImageEntry> {
  return withWriteTransaction(options.log.writer, async (tx) => {
    const entry = await readImageEntry(
      { deploymentKey: options.log.deploymentKey, writer: { ...options.log.writer, db: tx } },
      input.image,
    );

    if (entry.kind !== 'ok') {
      return entry;
    }

    const isForgetStarted = await probeForgetStarted(tx, entry.row.sequence);

    if (isForgetStarted) {
      return { kind: 'forgotten', row: entry.row };
    }

    await writeRecordsInTransaction(tx, options.log, [
      {
        kind: imageNamedCodec.kind,
        definitions: options.definitions(),
        thread: input.thread,
        payload: imageNamedCodec.encode({ image: entry.row.image_id }),
        erasable: { name: input.name },
      },
    ]);

    return entry;
  });
}

// The kind is the memory module's record.forget_started, which this module cannot import.
async function probeForgetStarted(tx: Transaction<unknown>, sequence: number): Promise<boolean> {
  const result = await sql`
    select 1 as found from records
    where kind = 'record.forget_started' and json_extract(payload, '$.recordSequence') = ${sequence}
    limit 1
  `.execute(tx);

  return result.rows.length > 0;
}
