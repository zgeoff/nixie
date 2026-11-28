import type { Log } from '@heynixie/log';
import type { ImageRow } from './image-tables';
import { readErasingImageUUIDs } from './read-erasing-image-uuids';
import { readImageNames } from './read-image-names';
import { readImagePrompts } from './read-image-prompts';
import type { GalleryImage } from './types';

// The stored images in the shape the images page shows, with the name and the prompt of each. A
// forgotten image reads with no name and no prompt, and keeps its row so its edit chain stays.
export async function readGalleryImages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly ImageRow[],
): Promise<GalleryImage[]> {
  const [prompts, names, erasing] = await Promise.all([
    readImagePrompts(log, rows),
    readImageNames(
      log,
      rows.map((row) => row.image_id),
    ),
    readErasingImageUUIDs(
      log,
      rows.map((row) => row.uuid),
    ),
  ]);

  return rows.map((row) => {
    const prompt = prompts.get(row.image_id);
    const isForgotten = (prompt?.isForgotten ?? false) || erasing.has(row.uuid);

    return {
      image: row.image_id,
      name: isForgotten ? null : (names.get(row.image_id) ?? null),
      prompt: isForgotten ? null : (prompt?.prompt ?? null),
      from: row.parent_id,
      source: row.source,
      isPinned: row.is_pinned === 1,
      isForgotten,
      createdAtMs: row.created_at,
    };
  });
}
