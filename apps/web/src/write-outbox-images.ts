import { runOutboxImagesRequest } from './run-outbox-images-request';

// Keeps the images of an unsent message on the device under its client message ID, so the message
// goes with them after a reload.
export async function writeOutboxImages(
  clientMessageId: string,
  images: readonly File[],
): Promise<void> {
  await runOutboxImagesRequest('readwrite', (store) => store.put([...images], clientMessageId));
}
