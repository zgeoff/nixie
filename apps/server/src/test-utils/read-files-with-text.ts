import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

export async function readFilesWithText(root: string, text: string): Promise<readonly string[]> {
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
