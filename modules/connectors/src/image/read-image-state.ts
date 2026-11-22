import type { Log, LogTables } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { readImageRow } from './read-image-row';

export type ImageState = 'missing' | 'forgotten' | 'ok';

// Whether an image can still be read, from its row and the key of its record, without reading its
// bytes. A forget removes the key, so a forgotten image keeps its row.
export async function readImageState(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  id: string,
): Promise<{ readonly state: ImageState; readonly image: string | null }> {
  const row = await readImageRow(log, id);

  if (row === null) {
    return { state: 'missing', image: null };
  }

  const record = await log.writer.db
    .$extendTables<LogTables>()
    .selectFrom('records')
    .select('key_id')
    .where('sequence', '=', row.sequence)
    .executeTakeFirst();

  const keyID = record?.key_id ?? null;

  if (keyID === null) {
    return { state: 'forgotten', image: row.image_id };
  }

  const keys = await readRecordKeys(log, [keyID]);

  return { state: keys.get(keyID) ? 'ok' : 'forgotten', image: row.image_id };
}
