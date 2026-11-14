import { readdir } from 'node:fs/promises';
import type { SpoolFileName } from '@heynixie/wire';
import { parseSpoolFileName } from '@heynixie/wire';

export interface SpoolEntry {
  readonly name: string;
  readonly parsed: SpoolFileName;
}

// A name that fails to parse is left alone, and a folder that cannot be read has no entries.
export async function listSpoolFiles(directory: string): Promise<readonly SpoolEntry[]> {
  const names = await readdir(directory).catch(() => []);

  return names.flatMap((name) => {
    const parsed = parseSpoolFileName(name);

    return parsed === null ? [] : [{ name, parsed }];
  });
}
