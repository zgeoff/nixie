import { rm } from 'node:fs/promises';

export async function removeFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
