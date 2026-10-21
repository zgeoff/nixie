import { runOutboxImagesRequest } from './run-outbox-images-request';

// IndexedDB runs this transaction apart from other tabs' writes, and a tab stores a message before
// its images, so a new message's images stay.
export async function removeStaleOutboxImages(readKept: () => ReadonlySet<string>): Promise<void> {
  await runOutboxImagesRequest('readwrite', (store) => {
    const keys = store.getAllKeys();

    keys.addEventListener('success', () => {
      const kept = readKept();

      for (const key of keys.result) {
        if (typeof key === 'string' && !kept.has(key)) {
          store.delete(key);
        }
      }
    });

    return keys;
  });
}
