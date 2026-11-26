import { rename } from 'node:fs/promises';
import type { Overrides } from '../types';

// through a second file and a rename, so a gateway that reads mid-write sees the old file or the new
export async function writeOverride(path: string, overrides: Overrides): Promise<void> {
  const part = `${path}.part`;

  await Bun.write(part, JSON.stringify(overrides), { createPath: false });

  await rename(part, path);
}
