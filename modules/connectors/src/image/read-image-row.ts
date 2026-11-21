import type { Log } from '@heynixie/log';
import type { ImageRow, ImageTables } from './image-tables';

// An image by its short ID, or by its UUID, which a session can hold from before the short ID.
export async function readImageRow(log: Pick<Log, 'writer'>, id: string): Promise<ImageRow | null> {
  const row = await log.writer.db
    .$extendTables<ImageTables>()
    .selectFrom('images')
    .selectAll()
    .where((query) => query.or([query('image_id', '=', id), query('uuid', '=', id)]))
    .executeTakeFirst();

  return row ?? null;
}
