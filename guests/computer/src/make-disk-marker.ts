import { stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The first call to a disk that started empty sees true, once. The marker is a file, so a disk that
// the guest started on before, or that a move filled, reads as used.
export function makeDiskMarker(home: string): () => Promise<boolean> {
  const marker = join(home, '.nixie-disk-used');

  return async () => {
    const isUsed = await stat(marker)
      .then(() => true)
      .catch(() => false);

    if (!isUsed) {
      await writeFile(marker, '');
    }

    return !isUsed;
  };
}
