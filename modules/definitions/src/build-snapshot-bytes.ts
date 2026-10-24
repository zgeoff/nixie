import { isDefinitionsPath } from './is-definitions-path';

// The seed's total limit counts only the files the definitions source reads.
export function buildSnapshotBytes(
  sizes: ReadonlyMap<string, number>,
  files: ReadonlyMap<string, string | null>,
): number {
  const encoder = new TextEncoder();
  const after = new Map(sizes);

  for (const [path, text] of files) {
    if (text === null) {
      after.delete(path);
    } else {
      after.set(path, encoder.encode(text).byteLength);
    }
  }

  return [...after]
    .filter(([path]) => isDefinitionsPath(path))
    .reduce((total, [, size]) => total + size, 0);
}
