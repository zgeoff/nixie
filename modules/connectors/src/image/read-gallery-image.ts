import type { Log } from '@heynixie/log';
import { readGalleryImages } from './read-gallery-images';
import { readImageRow } from './read-image-row';
import type { GalleryImage } from './types';

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
