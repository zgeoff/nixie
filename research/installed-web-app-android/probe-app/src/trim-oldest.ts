// Removes the oldest entries of a Map or Set, which iterate in insertion order, until it holds at
// most the given count.
export function trimOldest<Key>(
  collection: { size: number; keys: () => IterableIterator<Key>; delete: (key: Key) => boolean },
  maxSize: number,
): void {
  for (const key of collection.keys()) {
    if (collection.size <= maxSize) {
      return;
    }

    collection.delete(key);
  }
}
