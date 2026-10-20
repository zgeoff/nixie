import { z } from 'zod';
import { runOutboxImagesRequest } from './run-outbox-images-request';

const storedImages = z.array(z.instanceof(File));

// Reads the images the device keeps for an unsent message, or none when it keeps no images for it
// or what it keeps is not a list of files.
export async function readOutboxImages(clientMessageId: string): Promise<readonly File[]> {
  const stored: unknown = await runOutboxImagesRequest('readonly', (store) =>
    store.get(clientMessageId),
  );

  const parsed = storedImages.safeParse(stored);

  return parsed.success ? parsed.data : [];
}
