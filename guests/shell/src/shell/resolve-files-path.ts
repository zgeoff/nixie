import { lstat, realpath } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';

// The path inside the files folder that a path names, or null when it leaves the folder by `..` or
// through a symlink. A relative path starts in the folder, and `~/files` is the folder.
export async function resolveFilesPath(root: string, path: string): Promise<string | null> {
  if (path === '' || path.includes('\0')) {
    return null;
  }

  const rootReal = await realpath(root);

  const inside = toFolderPath(path, [root, rootReal]);

  if (inside === null) {
    return null;
  }

  const target = resolve(rootReal, inside);

  if (!isInside(rootReal, target)) {
    return null;
  }

  const isReal = await probeRealInside(rootReal, target);

  return isReal ? target : null;
}

function toFolderPath(path: string, roots: readonly string[]): string | null {
  if (path === '~/files' || path.startsWith('~/files/')) {
    return path.slice('~/files'.length).replace(/^\//u, '') || '.';
  }

  if (!isAbsolute(path)) {
    return path;
  }

  const root = roots.find((candidate) => isInside(candidate, path));

  return root === undefined ? null : relative(root, path) || '.';
}

function isInside(root: string, path: string): boolean {
  const from = relative(root, path);

  return from === '' || (!from.startsWith('..') && !isAbsolute(from));
}

// the deepest part of the path that exists must resolve inside the folder
async function probeRealInside(rootReal: string, path: string): Promise<boolean> {
  let current = path;

  for (;;) {
    try {
      await lstat(current);

      const real = await realpath(current);

      return isInside(rootReal, real);
    } catch {
      const parent = dirname(current);

      if (parent === current) {
        return false;
      }

      current = parent;
    }
  }
}
