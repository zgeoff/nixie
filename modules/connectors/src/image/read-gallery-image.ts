import type { Log } from '@heynixie/log';
import type { ImageRow } from './image-tables';
import { readImageNames } from './read-image-names';
import { readImagePrompts } from './read-image-prompts';
import { readImageRow } from './read-image-row';

export interface GalleryImage {
  readonly image: string;

  // null when cleared, never set, or the image is forgotten
  readonly name: string | null;

  // null for an import and for a forgotten image
  readonly prompt: string | null;
  readonly from: string | null;
  readonly source: 'draw' | 'file' | 'photo';
  readonly isPinned: boolean;
  readonly isForgotten: boolean;
  readonly createdAtMs: number;
}

// The stored images in the shape the images page shows, with the name and the prompt of each. A
// forgotten image reads with no name and no prompt, and keeps its row so its edit chain stays.
export async function readGalleryImages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  rows: readonly ImageRow[],
): Promise<GalleryImage[]> {
  const [prompts, names] = await Promise.all([readImagePrompts(log, rows), readImageNames(log)]);

  return rows.map((row) => {
    const prompt = prompts.get(row.image_id);
    const isForgotten = prompt?.isForgotten ?? false;

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

// One stored image by its short ID or UUID, or null when no image has it.
export async function readGalleryImage(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  id: string,
): Promise<GalleryImage | null> {
  const row = await readImageRow(log, id);

  if (row === null) {
    return null;
  }

  const [image] = await readGalleryImages(log, [row]);

  return image ?? null;
}
