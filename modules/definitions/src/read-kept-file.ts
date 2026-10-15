import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { normalizeLineEndings } from './normalize-line-endings';
import { SnapshotError } from './snapshot-error';

// Reads one file the walk kept, with its line endings normalized. It checks again what the walk saw,
// because a file can change between the walk and the read. base is the resolved definitions root.
export async function readKeptFile(
  base: string,
  path: string,
  maxFileBytes: number,
): Promise<readonly [string, Uint8Array]> {
  const full = join(base, path);

  const dir = await realpath(dirname(full));

  if (dir !== base && !dir.startsWith(`${base}${sep}`)) {
    throw new SnapshotError('a symlink leads outside the definitions root', [path]);
  }

  const bytes = await readNoFollow(full, maxFileBytes);

  if (bytes === null) {
    throw new SnapshotError('a file changed while the snapshot read it', [path]);
  }

  return [path, normalizeLineEndings(bytes)];
}

// O_NOFOLLOW refuses a file swapped for a symlink, and the size comes from the open handle; null
// when the file is no longer a regular file within the per-file limit
async function readNoFollow(full: string, maxFileBytes: number): Promise<Uint8Array | null> {
  const handle = await open(full, constants.O_RDONLY | constants.O_NOFOLLOW).catch(() => null);

  if (handle === null) {
    return null;
  }

  try {
    const stat = await handle.stat();

    if (!stat.isFile() || stat.size > maxFileBytes) {
      return null;
    }

    const bytes = await handle.readFile();

    return new Uint8Array(bytes);
  } finally {
    await handle.close();
  }
}
