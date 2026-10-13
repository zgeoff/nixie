import { closeSync, openSync, readdirSync, readSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// Every file under the folders that holds the text, found by reading each file in chunks, so a
// file of any size is read to its end. It skips the excluded folders, so a scan of /tmp leaves out
// a task directory that itself sits under /tmp.
export function collectFilesWith(dirs: string[], text: string, excluded: string[] = []): string[] {
  const found: string[] = [];
  const needle = Buffer.from(text);
  const visit = (path: string): void => {
    if (excluded.some((dir) => isInside(path, dir))) {
      return;
    }
    let stat;
    try {
      stat = statSync(path);
    } catch {
      return;
    }
    if (stat.isDirectory()) {
      let names: string[] = [];
      try {
        names = readdirSync(path);
      } catch {
        return;
      }
      for (const name of names) {
        visit(join(path, name));
      }
    } else if (stat.isFile()) {
      try {
        if (hasText(path, needle)) {
          found.push(path);
        }
      } catch {
        // a file the scan cannot read belongs to another user
      }
    }
  };
  for (const dir of dirs) {
    visit(dir);
  }
  return found;
}

const chunkSize = 8 * 1024 * 1024;

// Each read keeps the last needle.length - 1 bytes of the one before it, so a match that crosses
// a chunk boundary is still found.
function hasText(path: string, needle: Buffer): boolean {
  const overlap = Math.max(needle.length - 1, 0);
  const buffer = Buffer.alloc(overlap + chunkSize);
  const fd = openSync(path, 'r');
  try {
    let kept = 0;
    for (;;) {
      const read = readSync(fd, buffer, kept, chunkSize, null);
      if (read === 0) {
        return false;
      }
      const filled = kept + read;
      if (buffer.subarray(0, filled).includes(needle)) {
        return true;
      }
      kept = Math.min(overlap, filled);
      buffer.copy(buffer, 0, filled - kept, filled);
    }
  } finally {
    closeSync(fd);
  }
}

function isInside(path: string, dir: string): boolean {
  const rel = relative(dir, path);
  return rel === '' || (!rel.startsWith('..') && !rel.startsWith('/'));
}
