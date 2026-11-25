import { movePackageStaging } from './move-package-staging';
import type { UnpackedFile } from './types';
import { writePackageStaging } from './write-package-staging';

// Puts the files of a package in its folder, replacing what the folder held. They go to a
// folder beside it first, so a crash leaves a whole package or none.
export async function writePackageFiles(
  directory: string,
  files: readonly UnpackedFile[],
): Promise<void> {
  const staging = await writePackageStaging(directory, files);

  await movePackageStaging(staging, directory);
}
