import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { toTerminalLines } from './to-terminal-lines';

// how much of the end of the log is read: more than 32 lines hold, as lines can be long
const tailBytes = 64 * 1024;

// Reads the lines the terminal shows from the end of its log. A log that does not exist yet shows
// nothing. The terminal's account owns the log's folder and can swap the file, so a link or any file
// that is not a regular one shows nothing, and the open never waits on a pipe.
const openFlags = constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;

export function makeTerminalTextReader(logPath: string): () => Promise<string> {
  return async () => {
    const file = await open(logPath, openFlags).catch(() => null);

    if (file === null) {
      return '';
    }

    try {
      const stat = await file.stat();

      if (!stat.isFile()) {
        return '';
      }

      const start = Math.max(0, stat.size - tailBytes);
      const buffer = Buffer.alloc(stat.size - start);

      await file.read(buffer, 0, buffer.byteLength, start);

      return toTerminalLines(buffer.toString('utf8'));
    } finally {
      await file.close();
    }
  };
}
