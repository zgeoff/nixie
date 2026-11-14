import { definitionsLayout } from './definitions-layout';

export function isDefinitionsRootEntry(name: string): boolean {
  return definitionsLayout.files.has(name) || definitionsLayout.folders.has(name);
}
