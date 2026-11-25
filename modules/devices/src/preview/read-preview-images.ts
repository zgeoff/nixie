import { readImageEntry } from '@heynixie/connectors';
import type { Log } from '@heynixie/log';
import type { RenderFile } from '@heynixie/wire';

// The file of each image that the screen shows, by the image's short ID. An image that is missing
// or that a forget removed has none.
export async function readPreviewImages(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  images: readonly string[],
): Promise<ReadonlyMap<string, RenderFile>> {
  const files = new Map<string, RenderFile>();

  for (const image of new Set(images)) {
    const entry = await readImageEntry(log, image);

    if (entry.kind === 'ok') {
      files.set(image, {
        path: `images/${files.size}`,
        mediaType: entry.row.media_type,
        base64: Buffer.from(entry.bytes).toString('base64'),
      });
    }
  }

  return files;
}
