import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Runs one fetch inside a new temporary directory under root, and removes the directory when the
// fetch ends, so nothing one page leaves on disk reaches the next fetch.
export async function withFetchDirectory<T>(
  root: string,
  run: (directory: string) => Promise<T>,
): Promise<T> {
  const directory = await mkdtemp(join(root, 'fetch-'));

  try {
    return await run(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
