import { extname } from 'node:path/posix';
import { definitionsLayout } from './definitions-layout';

const definitionsExtensions = new Set(['.json', '.md', '.yaml', '.yml']);
const taskExtensions = new Set(['.md', '.ts', '.yaml']);

export function isDefinitionsPath(path: string): boolean {
  const parts = path.split('/');

  if (parts.some((part) => part.startsWith('.'))) {
    return false;
  }

  if (parts.length === 1) {
    return definitionsLayout.files.has(path);
  }

  const [folder] = parts;

  if (folder === 'skills') {
    return true;
  }

  const extensions = folder === 'tasks' ? taskExtensions : definitionsExtensions;

  return definitionsLayout.folders.has(folder ?? '') && extensions.has(extname(path));
}
