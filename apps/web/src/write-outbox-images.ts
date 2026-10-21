import { runOutboxImagesRequest } from './run-outbox-images-request';

export async function writeOutboxImages(
  clientMessageId: string,
  images: readonly File[],
): Promise<void> {
  await runOutboxImagesRequest('readwrite', (store) => store.put([...images], clientMessageId));
}
