import { extname } from 'node:path/posix';

const definitionsExtensions = new Set(['.json', '.md', '.yaml', '.yml']);

// The filter every source applies to a path relative to the definitions root: a definitions file
// has an allowed extension, and no part of its path starts with a dot, such as .git.
export function isDefinitionsPath(path: string): boolean {
  if (path.split('/').some((part) => part.startsWith('.'))) {
    return false;
  }
  return definitionsExtensions.has(extname(path));
}
