import { constants } from 'node:fs';
import { open } from 'node:fs/promises';

const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

// Opens without following a link and checks the open handle, so a path swapped for a link or a FIFO
// after an earlier check is refused instead of read, and a read never waits on a FIFO's writer.
// Returns null for anything but a regular file of at most limitBytes that kept its size.
export async function readSpoolBytes(
  path: string,
  limitBytes: number,
): Promise<Uint8Array<ArrayBuffer> | null> {
  const handle = await open(path, openFlags).catch(() => null);

  if (handle === null) {
    return null;
  }

  try {
    const info = await handle.stat();

    if (!info.isFile() || info.size > limitBytes) {
      return null;
    }

    // one byte past the size shows a file that grew after the stat
    const buffer = new Uint8Array(info.size + 1);

    let length = 0;

    while (length < buffer.length) {
      const read = await handle.read(buffer, length, buffer.length - length, null);

      if (read.bytesRead === 0) {
        break;
      }

      length += read.bytesRead;
    }

    return length > info.size ? null : buffer.slice(0, length);
  } finally {
    await handle.close();
  }
}
