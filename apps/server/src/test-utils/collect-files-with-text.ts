import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Collects every file under a directory whose bytes hold the text, as paths relative to it. It
// reads every file it reports as clean, whatever its size, and finds nothing under a missing
// directory.
export async function collectFilesWithText(root: string, text: string): Promise<readonly string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true }).catch(() => []);

  const needle = Buffer.from(text);
  const files = entries.filter((entry) => entry.isFile());

  const found = await Promise.all(
    files.map(async (entry) => {
      const path = join(entry.parentPath, entry.name);

      const bytes = await readFile(path);

      return bytes.includes(needle) ? [path.slice(root.length + 1)] : [];
    }),
  );

  return found.flat().toSorted();
}
