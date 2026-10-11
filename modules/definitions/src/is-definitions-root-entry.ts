import { definitionsLayout } from './definitions-layout';

// Whether a name at the definitions root is one of the known definitions paths. A source skips
// every other root entry by name, without reading or entering it, so the skipped list still shows
// a misnamed folder such as rule/.
export function isDefinitionsRootEntry(name: string): boolean {
  return definitionsLayout.files.has(name) || definitionsLayout.folders.has(name);
}
