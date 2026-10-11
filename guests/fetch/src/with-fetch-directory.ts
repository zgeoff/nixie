import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

// Runs one fetch inside a new temporary directory under root, and removes the directory when the
// fetch ends, so nothing one page leaves on disk reaches the next fetch.
export async function withFetchDirectory<T>(
  root: string,
  run: (dir: string) => Promise<T>,
): Promise<T> {
  const dir = await mkdtemp(join(root, 'fetch-'));

  try {
    return await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
