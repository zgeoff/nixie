import { runOutboxImagesRequest } from './run-outbox-images-request';

// Removes the images the device keeps for every message the outbox no longer holds, such as one the
// server confirmed or one you forgot, so no image outlives its message on the device.
export async function removeStaleOutboxImages(kept: ReadonlySet<string>): Promise<void> {
  const keys = await runOutboxImagesRequest('readonly', (store) => store.getAllKeys());

  const stale = keys.filter((key) => typeof key === 'string' && !kept.has(key));

  await Promise.all(
    stale.map((key) => runOutboxImagesRequest('readwrite', (store) => store.delete(key))),
  );
}
