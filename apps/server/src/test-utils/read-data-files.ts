import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// Reads each file at the data directory's root as latin1 text, so a byte search finds any ASCII
// string in it: nixie.db and keys.db with their write-ahead logs. The process double's sandboxes
// directory stands in for each imp's own disk, so it stays out.
export async function readDataFiles(
  dataDir: string,
  readBytes: (path: string) => Promise<Buffer> = (path) => readFile(path),
): Promise<readonly { readonly name: string; readonly text: string }[]> {
  const entries = await readdir(dataDir, { withFileTypes: true });

  const files = entries.filter((entry) => entry.isFile());

  const read = await Promise.all(
    files.map(async (file) => {
      try {
        const bytes = await readBytes(join(dataDir, file.name));

        return [{ name: file.name, text: bytes.toString('latin1') }];
      } catch (error) {
        // SQLite removes nixie.db-journal when its transaction ends, which can fall between the
        // directory read and the file read.
        if (isMissingFileError(error)) {
          return [];
        }

        throw error;
      }
    }),
  );

  return read.flat();
}

function isMissingFileError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
