import { extname } from 'node:path/posix';

const definitionsExtensions = new Set(['.json', '.md', '.yaml', '.yml']);

// The filter every source applies to a path relative to the definitions root. No part of the path
// starts with a dot, such as .git. Under skills/ every file passes, because a skill brings its
// scripts, and elsewhere only an allowed extension passes.
export function isDefinitionsPath(path: string): boolean {
  if (path.split('/').some((part) => part.startsWith('.'))) {
    return false;
  }
  return path.startsWith('skills/') || definitionsExtensions.has(extname(path));
}
