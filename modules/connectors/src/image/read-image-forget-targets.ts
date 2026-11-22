import type { Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import { readImageRow } from './read-image-row';

export interface ImageForgetTarget {
  readonly thread: string;
  readonly sequence: number;
}

export interface ImageForgetTargets {
  // the short ID of the image
  readonly image: string;
  readonly targets: readonly ImageForgetTarget[];
}

// The records that a forget of the image takes, on whichever thread each one sits: the call, the
// result that holds the bytes and the prompt, and every record that names the image. Null when no
// image has the ID.
export async function readImageForgetTargets(
  log: Pick<Log, 'writer'>,
  id: string,
): Promise<ImageForgetTargets | null> {
  const row = await readImageRow(log, id);

  if (row === null) {
    return null;
  }

  const db = log.writer.db.$extendTables<LogTables>();

  const result = await db
    .selectFrom('records')
    .select(['sequence', 'thread', 'parent'])
    .where('sequence', '=', row.sequence)
    .executeTakeFirst();

  const call =
    result?.parent === null || result?.parent === undefined
      ? undefined
      : await db
          .selectFrom('records')
          .select(['sequence', 'thread'])
          .where('sequence', '=', result.parent)
          .executeTakeFirst();

  const names = await db
    .selectFrom('records')
    .select(['sequence', 'thread'])
    .where('kind', '=', 'image.named')
    .where(sql`json_extract(payload, '$.image')`, '=', row.image_id)
    .orderBy('sequence')
    .execute();

  const records = [call, result, ...names].filter((record) => record !== undefined);

  return {
    image: row.image_id,
    targets: records.flatMap((record) =>
      record.thread === null ? [] : [{ thread: record.thread, sequence: record.sequence }],
    ),
  };
}
