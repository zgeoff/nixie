import { z } from 'zod';
import { runOutboxImagesRequest } from './run-outbox-images-request';

const storedImages = z.array(z.instanceof(File));

export async function readOutboxImages(clientMessageId: string): Promise<readonly File[]> {
  const stored: unknown = await runOutboxImagesRequest('readonly', (store) =>
    store.get(clientMessageId),
  );

  const parsed = storedImages.safeParse(stored);

  return parsed.success ? parsed.data : [];
}
