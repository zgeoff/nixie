import type { TaskFolder } from './types';

const taskFilePattern = /^tasks\/(?<id>[^/]+)\/(?<name>.+)$/u;

// A file directly under tasks/ and a file in a folder inside a definition folder belong to no
// definition, so they stay out of the result.
export function collectTaskFolders(texts: ReadonlyMap<string, string>): readonly TaskFolder[] {
  const folders = new Map<string, Map<string, string>>();

  for (const [path, text] of texts) {
    const match = taskFilePattern.exec(path);
    const id = match?.groups?.['id'];
    const name = match?.groups?.['name'];

    if (id === undefined || name === undefined) {
      continue;
    }

    const files = folders.get(id) ?? new Map<string, string>();

    if (!name.includes('/')) {
      files.set(name, text);
    }

    folders.set(id, files);
  }

  return [...folders.entries()]
    .toSorted(([left], [right]) => (left < right ? -1 : 1))
    .map(([id, files]) => ({ id, files }));
}
