import { constants } from 'node:fs';
import { open, realpath } from 'node:fs/promises';
import { dirname, join, sep } from 'node:path';
import { normalizeLineEndings } from './normalize-line-endings';
import { SnapshotError } from './snapshot-error';

export async function readKeptFile(
  base: string,
  path: string,
  maxFileBytes: number,
): Promise<readonly [string, Uint8Array]> {
  const full = join(base, path);

  const directory = await realpath(dirname(full));

  if (directory !== base && !directory.startsWith(`${base}${sep}`)) {
    throw new SnapshotError('a symlink leads outside the definitions root', [path]);
  }

  const bytes = await readNoFollow(full, maxFileBytes);

  if (bytes === null) {
    throw new SnapshotError('a file changed while the snapshot read it', [path]);
  }

  return [path, normalizeLineEndings(bytes)];
}

// O_NOFOLLOW makes open refuse a file swapped for a symlink, and the size comes from the open
// handle, because the path can point at another file once the stat returns.
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
