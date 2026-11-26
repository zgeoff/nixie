import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { getPackageDir } from './get-package-dir';
import { pickMediaType } from './pick-media-type';
import { readDevicePackage } from './read-device-packages';

export interface PackageFileSource {
  readonly db: Kysely<unknown>;
  readonly dataDir: string;
}

export interface PackageFileRequest {
  readonly name: string;
  readonly version: string;
  readonly path: string;
}

export interface PackageFile {
  readonly bytes: Uint8Array;
  readonly mediaType: string;
}

// One file of an approved package, or null for a package that is not approved or a path that its
// stored file list lacks. The path is only looked up in that list and never joined from the
// request alone, so a `..` finds nothing.
export async function readPackageFile(
  source: PackageFileSource,
  request: PackageFileRequest,
): Promise<PackageFile | null> {
  const found = await readDevicePackage(source.db, request.name, request.version);

  const path = found?.files.find((file) => file === request.path);

  if (found === null || path === undefined) {
    return null;
  }

  const file = Bun.file(join(getPackageDir(source.dataDir, found.name, found.version), path));

  if (!(await file.exists())) {
    return null;
  }

  return { bytes: await file.bytes(), mediaType: pickMediaType(path) };
}
