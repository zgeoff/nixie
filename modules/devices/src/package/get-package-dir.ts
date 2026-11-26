import { join } from 'node:path';

// The folder that holds the files of one approved package, in the server's data folder. The name
// and the version passed the package spec pattern, so neither holds a `..` or a backslash.
export function getPackageDir(dataDir: string, name: string, version: string): string {
  return join(dataDir, 'device-packages', `${name}@${version}`);
}
