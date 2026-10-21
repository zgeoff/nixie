import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

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
