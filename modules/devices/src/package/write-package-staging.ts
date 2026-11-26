import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isUnsafePackagePath } from './is-unsafe-package-path';
import type { UnpackedFile } from './types';

// Writes the files to a new folder beside the package's folder, and returns that folder. Nothing is
// served from it until movePackageStaging moves it into place.
export async function writePackageStaging(
  directory: string,
  files: readonly UnpackedFile[],
): Promise<string> {
  // the guest checks each path, and the server checks again, so a guest that went wrong writes
  // nothing outside the package's folder
  const unsafe = files.find((file) => isUnsafePackagePath(file.path));

  if (unsafe !== undefined) {
    throw new Error(`the package holds the unsafe path ${JSON.stringify(unsafe.path)}`);
  }

  const staging = `${directory}.${crypto.randomUUID()}.tmp`;

  await mkdir(staging, { recursive: true });

  for (const file of files) {
    const target = join(staging, file.path);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.bytes);
  }

  return staging;
}
