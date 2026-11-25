import { mkdir, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, normalize } from 'node:path';

export interface UnpackedFile {
  readonly path: string;
  readonly bytes: Uint8Array;
}

// Puts the files of a package in its folder, replacing what the folder held. They go to a
// folder beside it first, so a crash leaves a whole package or none.
export async function writePackageFiles(
  directory: string,
  files: readonly UnpackedFile[],
): Promise<void> {
  // the guest checks each path, and the server checks again, so a guest that went wrong writes
  // nothing outside the package's folder
  const unsafe = files.find((file) => isUnsafePath(file.path));

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

  await rm(directory, { recursive: true, force: true });
  await mkdir(dirname(directory), { recursive: true });
  await rename(staging, directory);
}

function isUnsafePath(path: string): boolean {
  return (
    path === '' ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    normalize(path).split('/').includes('..') ||
    normalize(path) !== path
  );
}
