import { isAbsolute, normalize } from 'node:path';

export function isUnsafePackagePath(path: string): boolean {
  return (
    path === '' ||
    isAbsolute(path) ||
    path.includes('\\') ||
    path.includes('\0') ||
    normalize(path).split('/').includes('..') ||
    normalize(path) !== path
  );
}
