import type { Log } from '@heynixie/log';
import type { ImageTables } from './image-tables';

// The short IDs of the stored images, among the IDs a draw names, that were imported from a photo
// of the owner. An ID can be a short ID or a UUID, and a name that matches no image is left out.
export async function readPhotoImageIDs(
  log: Pick<Log, 'writer'>,
  ids: readonly string[],
): Promise<string[]> {
  if (ids.length === 0) {
    return [];
  }

  const rows = await log.writer.db
    .$extendTables<ImageTables>()
    .selectFrom('images')
    .select(['image_id', 'source'])
    .where((query) => query.or([query('image_id', 'in', ids), query('uuid', 'in', ids)]))
    .execute();

  return rows.filter((row) => row.source === 'photo').map((row) => row.image_id);
}
