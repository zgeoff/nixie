import { resolve, sep } from 'node:path';

// Maps an absolute guest path under the sandbox's own directory, and refuses a path that climbs out.
export function resolveGuestPath(fsRoot: string, guestPath: string): string {
  if (!guestPath.startsWith('/')) {
    throw new Error(`a guest path must be absolute: ${guestPath}`);
  }
  const path = resolve(fsRoot, `.${guestPath}`);

  if (path !== fsRoot && !path.startsWith(`${fsRoot}${sep}`)) {
    throw new Error(`a guest path must stay inside the sandbox: ${guestPath}`);
  }
  return path;
}
