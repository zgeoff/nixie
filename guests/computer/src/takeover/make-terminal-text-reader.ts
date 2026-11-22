import { open } from 'node:fs/promises';
import { toTerminalLines } from './to-terminal-lines';

// how much of the end of the log is read: more than 32 lines hold, as lines can be long
const tailBytes = 64 * 1024;

// Reads the lines the terminal shows from the end of its log. A log that does not exist yet shows
// nothing.
export function makeTerminalTextReader(logPath: string): () => Promise<string> {
  return async () => {
    const file = await open(logPath, 'r').catch(() => null);

    if (file === null) {
      return '';
    }

    try {
      const stat = await file.stat();

      const start = Math.max(0, stat.size - tailBytes);
      const buffer = Buffer.alloc(stat.size - start);

      await file.read(buffer, 0, buffer.byteLength, start);

      return toTerminalLines(buffer.toString('utf8'));
    } finally {
      await file.close();
    }
  };
}
