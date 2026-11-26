import { mkdir, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';

// Puts a staged package in its folder, replacing what the folder held.
export async function movePackageStaging(staging: string, directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
  await mkdir(dirname(directory), { recursive: true });
  await rename(staging, directory);
}
