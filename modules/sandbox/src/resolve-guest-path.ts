import { resolve, sep } from 'node:path';

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
